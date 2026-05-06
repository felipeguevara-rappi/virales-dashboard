declare module 'react-plotly.js' {
  import { Component } from 'react';

  interface PlotParams {
    data: Plotly.Data[];
    layout?: Partial<Plotly.Layout>;
    config?: Partial<Plotly.Config>;
    frames?: Plotly.Frame[];
    revision?: number;
    onInitialized?: (figure: { data: Plotly.Data[]; layout: Partial<Plotly.Layout> }, graphDiv: HTMLElement) => void;
    onUpdate?: (figure: { data: Plotly.Data[]; layout: Partial<Plotly.Layout> }, graphDiv: HTMLElement) => void;
    onPurge?: (figure: { data: Plotly.Data[]; layout: Partial<Plotly.Layout> }, graphDiv: HTMLElement) => void;
    onError?: (err: Error) => void;
    onRelayout?: (event: Plotly.PlotRelayoutEvent) => void;
    onClick?: (event: Plotly.PlotMouseEvent) => void;
    onHover?: (event: Plotly.PlotHoverEvent) => void;
    onUnhover?: (event: Plotly.PlotMouseEvent) => void;
    onSelected?: (event: Plotly.PlotSelectionEvent) => void;
    className?: string;
    style?: React.CSSProperties;
    useResizeHandler?: boolean;
    debug?: boolean;
    divId?: string;
  }

  class Plot extends Component<PlotParams> {}
  export default Plot;
}

declare namespace Plotly {
  interface Data {
    [key: string]: unknown;
    x?: unknown[];
    y?: unknown[];
    z?: unknown[];
    text?: string | string[];
    name?: string;
    type?: string;
    mode?: string;
    marker?: { [key: string]: unknown };
    line?: { [key: string]: unknown };
    textposition?: string;
    textfont?: { [key: string]: unknown };
  }

  interface Layout {
    [key: string]: unknown;
  }

  interface Config {
    [key: string]: unknown;
  }

  interface Frame {
    [key: string]: unknown;
  }

  interface PlotRelayoutEvent {
    [key: string]: unknown;
  }

  interface PlotMouseEvent {
    points: Array<{ [key: string]: unknown }>;
    event: MouseEvent;
  }

  interface PlotHoverEvent {
    points: Array<{ [key: string]: unknown }>;
    event: MouseEvent;
  }

  interface PlotSelectionEvent {
    points: Array<{ [key: string]: unknown }>;
  }
}
