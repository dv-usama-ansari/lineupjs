import {computeHist, ICategoricalBin, ICategoricalStatistics} from '../internal/math';
import {ICategoricalColumn, IDataRow, IGroup, isCategoricalColumn} from '../model';
import CategoricalColumn from '../model/CategoricalColumn';
import Column from '../model/Column';
import OrdinalColumn from '../model/OrdinalColumn';
import {filterMissingNumberMarkup} from '../ui/missing';
import {interactiveHist} from './CategoricalCellRenderer';
import {default as IRenderContext, ERenderMode, ICellRendererFactory} from './interfaces';
import {forEachChild, noRenderer} from './utils';

/**
 * renders categorical columns as a colored rect with label
 */
export default class CategoricalStackedDistributionlCellRenderer implements ICellRendererFactory {
  readonly title = 'Distribution Bar';

  canRender(col: Column, mode: ERenderMode) {
    return isCategoricalColumn(col) && mode !== ERenderMode.CELL;
  }

  create() {
    return noRenderer;
  }


  createGroup(col: ICategoricalColumn) {
    const {template, update} = stackedBar(col);
    return {
      template,
      update: (n: HTMLElement, _group: IGroup, rows: IDataRow[]) => {
        const {hist, missing} = computeHist(rows, (r: IDataRow) => col.isMissing(r) ? '' : col.getCategory(r)!.name, col.categories.map((d) => d.name));
        update(n, hist, missing);
      }
    };
  }

  createSummary(col: ICategoricalColumn, _context: IRenderContext, interactive: boolean) {
    return (col instanceof CategoricalColumn || col instanceof OrdinalColumn) ? interactiveSummary(col, interactive) : staticSummary(col);
  }
}

function staticSummary(col: ICategoricalColumn) {
  const {template, update} = stackedBar(col);
  return {
    template,
    update: (n: HTMLElement, hist: ICategoricalStatistics | null) => {
      n.classList.toggle('lu-missing', !hist);
      if (!hist) {
        return;
      }
      update(n, hist.hist, hist.missing);
    }
  };
}

function interactiveSummary(col: CategoricalColumn | OrdinalColumn, interactive: boolean) {
  const {template, update} = stackedBar(col);
  let filterUpdate: (missing: number, col: CategoricalColumn | OrdinalColumn) => void;
  return {
    template: template + (interactive ? filterMissingNumberMarkup(false, 0) : ''),
    update: (n: HTMLElement, hist: ICategoricalStatistics | null) => {
      if (!filterUpdate) {
        filterUpdate = interactiveHist(col, n);
      }
      filterUpdate(hist ? hist.missing : 0, col);

      n.classList.toggle('lu-missing', !hist);
      if (!hist) {
        return;
      }
      update(n, hist.hist, hist.missing);
    }
  };
}

function stackedBar(col: ICategoricalColumn) {
  const cats = col.categories;
  const bins = cats.map((c) => `<div style="background-color: ${c.color}" title="${c.label}: 0" data-cat="${c.name}">${c.label}</div>`).join('');

  return {
    template: `<div>${bins}<div title="Missing Values"></div></div>`,
    update: (n: HTMLElement, hist: ICategoricalBin[], missing: number) => {
      const total = hist.reduce((acc, {y}) => acc + y, missing);
      forEachChild(n, (d: HTMLElement, i) => {
        let y: number;
        let label: string;
        if (i >= hist.length) {
          y = missing;
          label = 'Missing Values';
        } else {
          y = hist[i].y;
          label = cats[i].label;
        }
        d.style.flexGrow = `${Math.round(total === 0 ? 0 : y)}`;
        d.title = `${label}: ${y}`;
      });
    }
  };
}
