/**
 * Created by Samuel Gratzl on 18.07.2017.
 */
import {AEventDispatcher, debounce, findOption} from '../../utils';
import {default as ABodyRenderer} from '../ABodyRenderer';
import DataProvider, {default as ADataProvider} from '../../provider/ADataProvider';
import {default as Column, ICategoricalStatistics, IFlatColumn, IStatistics} from '../../model/Column';
import {createDOM, createDOMGroup} from '../../renderer';
import {default as RenderColumn} from './RenderColumn';
import {IGroupData, IGroupItem, IRankingBodyContext, isGroup} from './interfaces';
import EngineRankingRenderer from './EngineRankingRenderer';
import {ILineUpRenderer} from '../index';
import {ILineUpConfig, IRenderingOptions} from '../../lineup';
import {ICategoricalColumn, isCategoricalColumn} from '../../model/CategoricalColumn';
import NumberColumn from '../../model/NumberColumn';
import {nonUniformContext} from 'lineupengine/src/logic';
import {isMultiLevelColumn} from '../../model/CompositeColumn';
import MultiLevelRenderColumn from './MultiLevelRenderColumn';
import StackColumn from '../../model/StackColumn';

export default class EngineRenderer extends AEventDispatcher implements ILineUpRenderer {
  static readonly EVENT_HOVER_CHANGED = ABodyRenderer.EVENT_HOVER_CHANGED;
  static readonly EVENT_RENDER_FINISHED = ABodyRenderer.EVENT_RENDER_FINISHED;

  protected readonly options: Readonly<ILineUpConfig>;

  private readonly histCache = new Map<string, IStatistics | ICategoricalStatistics | null | Promise<IStatistics | ICategoricalStatistics>>();

  readonly node: HTMLElement;

  readonly ctx: IRankingBodyContext & { data: (IGroupItem | IGroupData)[] };

  private readonly renderer: EngineRankingRenderer;

  constructor(private data: DataProvider, parent: Element, options: Readonly<ILineUpConfig>) {
    super();
    this.options = options;
    this.node = parent.ownerDocument.createElement('main');
    parent.appendChild(this.node);

    this.ctx = {
      provider: data,
      filters: this.options.header.filters!,
      linkTemplates: this.options.header.linkTemplates!,
      autoRotateLabels: this.options.header.autoRotateLabels!,
      searchAble: this.options.header.searchAble!,
      option: findOption(this.options.body),
      statsOf: (col: Column) => {
        const r = this.histCache.get(col.id);
        if (r == null || r instanceof Promise) {
          return null;
        }
        return r;
      },
      renderer: (col: Column) => createDOM(col, this.options.renderers, this.ctx),
      groupRenderer: (col: Column) => createDOMGroup(col, this.options.renderers, this.ctx),
      idPrefix: this.options.idPrefix,
      data: [],
      isGroup: (index: number) => isGroup(this.ctx.data[index]),
      getGroup: (index: number) => <IGroupData>this.ctx.data[index],
      getRow: (index: number) => <IGroupItem>this.ctx.data[index],
      totalNumberOfRows: 0
    };

    this.renderer = new EngineRankingRenderer(this.node, this.options.idPrefix, this.ctx);

    this.initProvider(data);
  }

  protected createEventList() {
    return super.createEventList().concat([EngineRenderer.EVENT_HOVER_CHANGED, EngineRenderer.EVENT_RENDER_FINISHED]);
  }

  changeDataStorage(data: DataProvider) {
    this.data.on(`${ADataProvider.EVENT_SELECTION_CHANGED}.body`, null);
    this.data.on(`${DataProvider.EVENT_ORDER_CHANGED}.body`, null);
    this.data.on(`${DataProvider.EVENT_DIRTY}.body`, null);

    this.data = data;
    this.ctx.provider = data;

    this.initProvider(data);
  }

  private initProvider(data: DataProvider) {
    const that = this;

    data.on(`${ADataProvider.EVENT_SELECTION_CHANGED}.body`, () => this.renderer.updateSelection(data.getSelection()));
    data.on(`${DataProvider.EVENT_ORDER_CHANGED}.body`, () => this.updateHist());
    data.on(`${DataProvider.EVENT_DIRTY}.body`, debounce(function (this: { primaryType: string }) {
      if (this.primaryType !== Column.EVENT_WIDTH_CHANGED && this.primaryType !== StackColumn.EVENT_WEIGHTS_CHANGED) {
        that.update();
      }
    }));
  }

  private updateHist() {
    if (!this.options.header.summary) {
      return;
    }
    const rankings = this.data.getRankings();
    rankings.forEach((ranking) => {
      const order = ranking.getOrder();
      const cols = ranking.flatColumns;
      const histo = order == null ? null : this.data.stats(order);
      cols.filter((d) => d instanceof NumberColumn && !d.isHidden()).forEach((col: NumberColumn) => {
        this.histCache.set(col.id, histo === null ? null : histo.stats(col));
      });
      cols.filter((d) => isCategoricalColumn(d) && !d.isHidden()).forEach((col: ICategoricalColumn & Column) => {
        this.histCache.set(col.id, histo === null ? null : histo.hist(col));
      });
    });

    this.renderer.updateHeaders();
  }

  update() {
    // TODO support multiple rankings connected with slopegraphs
    const ranking = this.data.getRankings()[0];
    const groups = ranking.getGroups();

    const order = ranking.getOrder();
    const data = this.data.view(order);
    const localData = (Array.isArray(data) ? data : []).map((v, i) => ({v, dataIndex: order[i]}));

    if (groups.length === 1) {
      // simple case
      if (this.data.isAggregated(ranking, groups[0])) {
        // just a single row
        this.ctx.data = [Object.assign({rows: localData}, groups[0])];
      } else {
        // simple ungrouped case
        this.ctx.data = localData.map((r, i) => Object.assign({group: groups[0], relativeIndex: i}, r));
      }
    } else {
      //multiple groups
      let offset = 0;
      const r = <(IGroupItem | IGroupData)[]>[];
      groups.forEach((group) => {
        const length = group.order.length;
        const groupData = localData.slice(offset, offset + length);
        offset += length;

        if (this.data.isAggregated(ranking, group)) {
          r.push(Object.assign({rows: groupData}, group));
        } else {
          r.push(...groupData.map((r, i) => Object.assign({group, relativeIndex: i}, r)));
        }
      });
      this.ctx.data = r;
    }

    (<any>this.ctx).totalNumberOfRows = this.ctx.data.length;

    const flatCols: IFlatColumn[] = [];
    ranking.flatten(flatCols, 0, 1, 0);
    const cols = flatCols.map((c) => c.col);
    const columnPadding = this.options.header.columnPadding === undefined ? 5 : this.options.header.columnPadding;
    const columns = cols.map((c, i) => {
      const single = createDOM(c, this.options.renderers, this.ctx);
      const group = createDOMGroup(c, this.options.renderers, this.ctx);
      const renderers = {single, group, singleId: c.getRendererType(), groupId: c.getGroupRenderer()};
      if (isMultiLevelColumn(c)) {
        return new MultiLevelRenderColumn(c, renderers, i, columnPadding);
      }
      return new RenderColumn(c, renderers, i);
    });

    if (this.histCache.size === 0) {
      this.updateHist();
    }

    cols.forEach((c) => c.on(`${Column.EVENT_WIDTH_CHANGED}.body`, () => {
      this.renderer.updateColumnWidths();
    }));

    const rowContext = nonUniformContext(this.ctx.data.map((d) => isGroup(d) ? this.options.body.groupHeight! : this.options.body.rowHeight!), this.options.body.rowHeight!);

    this.renderer.render(columns, rowContext);
  }

  fakeHover(dataIndex: number) {
    const old = this.node.querySelector(`[data-data-index].lu-hovered`);
    if (old) {
      old.classList.remove('lu-hovered');
    }
    const item = this.node.querySelector(`[data-data-index="${dataIndex}"]`);
    if (item) {
      item.classList.add('lu-hovered');
    }
  }

  destroy() {
    // TODO
  }

  scrollIntoView(_index: number) {
    // TODO
  }

  setBodyOption(_option: keyof IRenderingOptions, _value: boolean) {
    // TODO
  }
}
