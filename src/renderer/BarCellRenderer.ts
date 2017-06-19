import ICellRendererFactory from './ICellRendererFactory';
import Column from '../model/Column';
import {INumberColumn} from '../model/NumberColumn';
import {IDOMRenderContext, ICanvasRenderContext} from './RendererContexts';
import {ISVGCellRenderer, IHTMLCellRenderer, ISVGGroupRenderer} from './IDOMCellRenderers';
import {IDataRow} from '../provider/ADataProvider';
import {attr, clipText} from '../utils';
import ICanvasCellRenderer, {ICanvasGroupRenderer} from './ICanvasCellRenderer';
import {IGroup} from '../model/Group';
import * as d3 from 'd3';


/**
 * a renderer rendering a bar for numerical columns
 */
export default class BarCellRenderer implements ICellRendererFactory {
  /**
   * flag to always render the value
   * @type {boolean}
   */

  constructor(private readonly renderValue: boolean = false, private colorOf: (d: any, i: number, col: Column) => string = (d, i, col) => col.color) {}

  createSVG(col: INumberColumn & Column, context: IDOMRenderContext): ISVGCellRenderer {
    const paddingTop = context.option('rowBarTopPadding', context.option('rowBarPadding', 1));
    const paddingBottom = context.option('rowBarBottomPadding', context.option('rowBarPadding', 1));
    return {
      template: `<g class='bar'>
          <rect class='${col.cssClass}' y='${paddingTop}' style='fill: ${col.color}'>
            <title></title>
          </rect>
          <text class='number ${this.renderValue ? '' : 'hoverOnly'}' clip-path='url(#cp${context.idPrefix}clipCol${col.id})'></text>
        </g>`,
      update: (n: SVGGElement, d: IDataRow, i: number) => {
        n.querySelector('rect title').textContent = col.getLabel(d.v, d.dataIndex);
        const width = col.getWidth() * col.getValue(d.v, d.dataIndex);

        attr(<SVGRectElement>n.querySelector('rect'), {
          y: paddingTop,
          width: isNaN(width) ? 0 : width,
          height: context.rowHeight(i) - (paddingTop + paddingBottom)
        }, {
          fill: this.colorOf(d.v, i, col)
        });
        attr(<SVGTextElement>n.querySelector('text'), {}).textContent = col.getLabel(d.v, d.dataIndex);
      }
    };
  }

  createHTML(col: INumberColumn & Column, context: IDOMRenderContext): IHTMLCellRenderer {
    const paddingTop = context.option('rowBarTopPadding', context.option('rowBarPadding', 1));
    const paddingBottom = context.option('rowBarBottomPadding', context.option('rowBarPadding', 1));
    return {
      template: `<div class='bar' style='top:${paddingTop}px; background-color: ${col.color}'>
          <span class='number ${this.renderValue ? '' : 'hoverOnly'}'></span>
        </div>`,
      update: (n: HTMLDivElement, d: IDataRow, i: number) => {
        const width = col.getWidth() * col.getValue(d.v, d.dataIndex);
        attr(n, {
          title: col.getLabel(d.v, d.dataIndex)
        }, {
          width: `${isNaN(width) ? 0 : width}px`,
          height: `${context.rowHeight(i) - (paddingTop + paddingBottom)}px`,
          top: `${paddingTop}px`,
          'background-color': this.colorOf(d.v, i, col)
        });
        n.querySelector('span').textContent = col.getLabel(d.v, d.dataIndex);
      }
    };
  }

  createCanvas(col: INumberColumn & Column, context: ICanvasRenderContext): ICanvasCellRenderer {
    const paddingTop = context.option('rowBarTopPadding', context.option('rowBarPadding', 1));
    const paddingBottom = context.option('rowBarBottomPadding', context.option('rowBarPadding', 1));
    return (ctx: CanvasRenderingContext2D, d: IDataRow, i: number) => {
      ctx.fillStyle = this.colorOf(d.v, i, col);
      const width = col.getWidth() * col.getValue(d.v, d.dataIndex);
      ctx.fillRect(0, paddingTop, isNaN(width) ? 0 : width, context.rowHeight(i) - (paddingTop + paddingBottom));
      if (this.renderValue || context.hovered(d.dataIndex) || context.selected(d.dataIndex)) {
        ctx.fillStyle = context.option('style.text', 'black');
        clipText(ctx, col.getLabel(d.v, d.dataIndex), 1, 0, col.getWidth() - 1, context.textHints);
      }
    };
  }

  private static createHistogram(col: INumberColumn & Column, totalNumberOfRows: number) {
    // as by default used in d3 the Sturges' formula
    const bins = Math.ceil(Math.log(totalNumberOfRows) / Math.LN2) + 1;
    const gen = d3.layout.histogram().range([0,1]).bins(bins);
    const scale = d3.scale.linear().domain([0, 1]).range([0, col.getWidth()]);
    return (rows: IDataRow[], height: number) => {
      const values = rows.map((d) => col.getValue(d.v, d.dataIndex));
      const bins = gen(values);
      const maxBin = d3.max(bins, (d) => d.y); //TODO synchronize among groups
      const yscale = d3.scale.linear().domain([0, maxBin]).range([height, 0]);
      return {bins, scale, yscale};
    };
  }

  createGroupSVG(col: INumberColumn & Column, context: IDOMRenderContext): ISVGGroupRenderer {
    const factory = BarCellRenderer.createHistogram(col, context.totalNumberOfRows);
    const padding = context.option('rowBarPadding', 1);
    return {
      template: `<g class='histogram'></g>`,
      update: (n: SVGGElement, group: IGroup, rows: IDataRow[]) => {
        const height = context.groupHeight(group) - padding;
        const {bins, scale, yscale} = factory(rows, height);
        const bars = d3.select(n).selectAll('rect').data(bins);
        bars.enter().append('rect');
        bars.attr({
          x: (d) => scale(d.x) + padding,
          y: (d) => yscale(d.y) + padding,
          width: (d) => scale(d.dx) - 2*padding,
          height: (d) => height - yscale(d.y),
          title: (d) => `${d.x} - ${d.x + d.dx} (${d.y})`
        });
      }
    };
  }

  createGroupCanvas(col: INumberColumn & Column, context: ICanvasRenderContext): ICanvasGroupRenderer {
    const factory = BarCellRenderer.createHistogram(col, context.totalNumberOfRows);
    const padding = context.option('rowBarPadding', 1);
    return (ctx: CanvasRenderingContext2D, group: IGroup, rows: IDataRow[]) => {
      const height = context.groupHeight(group) - padding;
      const {bins, scale, yscale} = factory(rows, height);
      ctx.fillStyle = context.option('style.histogram', 'lightgray');
      bins.forEach((d) => {
        ctx.fillRect(scale(d.x) + padding, yscale(d.y) + padding, scale(d.dx) - 2*padding, height - yscale(d.y));
      });
    };
  }
}
