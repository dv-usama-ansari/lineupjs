/**
 * Created by Samuel Gratzl on 25.07.2017.
 */
import Column from '../..//model/Column';
import {ICategoricalColumn, isCategoricalColumn} from '../../model/CategoricalColumn';
import {ICategoricalStatistics, IStatistics} from '../../model/Column';
import {INumberColumn, isNumberColumn} from '../../model/NumberColumn';
import SelectionColumn from '../../model/SelectionColumn';
import StringColumn from '../../model/StringColumn';
import ADataProvider from '../../provider/ADataProvider';
import {IRankingContext} from './RenderColumn';

export default function createSummary(node: HTMLElement, col: Column, ctx: IRankingContext) {
  if (col instanceof StringColumn) {
    summaryString(col, node);
  } else if (isCategoricalColumn(col)) {
    summaryCategorical(<ICategoricalColumn & Column>col, node, <ICategoricalStatistics>ctx.statsOf(<ICategoricalColumn & Column>col));
  } else if (isNumberColumn(col)) {
    summaryNumerical(<INumberColumn & Column>col, node, <IStatistics>ctx.statsOf(<INumberColumn & Column>col));
  } else if (col instanceof SelectionColumn) {
    summarySelection(col, node, ctx.provider);
  }
}

function summaryCategorical(col: ICategoricalColumn & Column, node: HTMLElement, stats: ICategoricalStatistics) {
  node.innerHTML = '';
  if (!stats) {
    return;
  }
  const cats = col.categories;
  const colors = col.categoryColors;

  stats.hist.forEach(({cat, y}) => {
    node.insertAdjacentHTML('beforeend', `<div style="height: ${Math.round(y * 100 / stats.maxBin)}%; background-color: ${colors[cats.indexOf(cat)]}" title="${cat}: ${y}" data-cat="${cat}"></div>`);
  });
}

function summaryNumerical(col: INumberColumn & Column, node: HTMLElement, stats: IStatistics) {
  node.innerHTML = '';
  if (!stats) {
    return;
  }
  stats.hist.forEach(({x, y}, i) => {
    node.insertAdjacentHTML('beforeend', `<div style="height: ${Math.round(y * 100 / stats.maxBin)}%" title="Bin ${i}: ${y}" data-x="${x}"></div>`);
  });
}

function summaryString(col: StringColumn & Column, node: HTMLElement) {
  const f = col.getFilter();
  node.textContent = f === null ? '' : f.toString();
}

function summarySelection(col: SelectionColumn, node: HTMLElement, provider: ADataProvider) {
  node.innerHTML = `<i class="fa fa-square-o" title="(Un)Select All"></i>`;
  const button = (<HTMLElement>node.firstElementChild);
  button.onclick = (evt) => {
    evt.stopPropagation();
    if (button.classList.contains('fa-square-o')) {
      const order = (col.findMyRanker()!).getOrder();
      provider.setSelection(order);
    } else {
      provider.clearSelection();
    }
    button.classList.toggle('fa-square-o');
    button.classList.toggle('fa-check-square-o');
  };
}
