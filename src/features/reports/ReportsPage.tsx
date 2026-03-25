import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Sankey,
  Rectangle,
  Layer
} from 'recharts';
import { Download, Filter, Calendar, Zap, Target, TrendingUp } from 'lucide-react';
import { extractApiError, parseApiResponse } from '@/lib/client/api-response';
import type { ReportsModel, ReportsPeriodPreset } from '@/src/features/reports/types';
import { EmptyState } from '@/src/app-shell/components/EmptyState';
import { Skeleton } from '@/src/app-shell/components/ShellSkeleton';
import { formatCurrency } from '@/src/app-shell/utils';

interface ReportsProps {
  hideValues: boolean;
}

export { Reports as ReportsPage };

type SankeyNodeRendererProps = {
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
  payload: {
    fill?: string;
    name?: string;
    value?: number;
  };
};

type SankeyNodeProps = SankeyNodeRendererProps & {
  hideValues: boolean;
};

type SankeyLinkProps = {
  sourceX?: number;
  targetX?: number;
  sourceY?: number;
  targetY?: number;
  sourceControlX?: number;
  targetControlX?: number;
  linkWidth?: number;
  index?: number;
  payload?: {
    source?: {
      fill?: string;
    };
    target?: {
      fill?: string;
    };
  };
};

type ReportsMetricsResponse = {
  view: 'reports';
  period: {
    current: {
      preset: ReportsPeriodPreset;
      label: string;
      start: string;
      end: string;
    };
    previous: {
      preset: ReportsPeriodPreset;
      label: string;
      start: string;
      end: string;
    };
  };
  model: Omit<ReportsModel, 'timeSeries' | 'recurringDetected'> & {
    timeSeries: Array<
      ReportsModel['timeSeries'][number] & {
        from: string;
        to: string;
      }
    >;
    recurringDetected: Array<
      Omit<ReportsModel['recurringDetected'][number], 'nextExpectedDate'> & {
        nextExpectedDate: string | null;
      }
    >;
  };
};

const REPORTS_TOOLTIP_STYLE = {
  backgroundColor: "hsl(var(--card) / 0.96)",
  backdropFilter: "blur(16px)",
  border: "1px solid hsl(var(--border) / 0.9)",
  borderRadius: "16px",
  boxShadow: "0 18px 42px hsl(var(--overlay) / 0.18)"
} as const;

const REPORTS_TOOLTIP_ITEM_STYLE = {
  color: "hsl(var(--foreground))",
  fontSize: "12px",
  fontWeight: 500
} as const;

const REPORTS_GRID_STROKE = "hsl(var(--border) / 0.22)";
const REPORTS_CURSOR_FILL = "hsl(var(--muted-foreground) / 0.08)";

const CustomNode = (props: SankeyNodeProps) => {
  const { x, y, width, height, index, payload, hideValues } = props;
  const isLeft = x < 250;
  return (
    <Layer key={`CustomNode${index}`}>
      <Rectangle
        x={x}
        y={y}
        width={width}
        height={height}
        fill={payload.fill || 'hsl(var(--primary))'}
        fillOpacity="1"
        radius={4}
      />
      <text
        textAnchor={isLeft ? 'start' : 'end'}
        x={isLeft ? x + width + 12 : x - 12}
        y={y + height / 2 - 6}
        fontSize="12"
        fill="hsl(var(--foreground))"
        fillOpacity="0.92"
        fontWeight="600"
        className="font-sans"
      >
        {payload.name}
      </text>
      <text
        textAnchor={isLeft ? 'start' : 'end'}
        x={isLeft ? x + width + 12 : x - 12}
        y={y + height / 2 + 10}
        fontSize="11"
        fill="hsl(var(--muted-foreground))"
        fillOpacity="0.84"
        className="font-mono font-medium"
      >
        {formatCurrency(Number(payload.value ?? 0), hideValues)}
      </text>
    </Layer>
  );
};

const CustomLink = (props: SankeyLinkProps) => {
  const {
    sourceX = 0,
    targetX = 0,
    sourceY = 0,
    targetY = 0,
    sourceControlX = 0,
    targetControlX = 0,
    linkWidth = 0,
    index = 0,
    payload
  } = props;

  const sourceColor = payload?.source?.fill || 'hsl(var(--border))';
  const targetColor = payload?.target?.fill || 'hsl(var(--border))';

  return (
    <Layer key={`CustomLink${index}`}>
      <defs>
        <linearGradient id={`linkGradient${index}`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={sourceColor} stopOpacity={0.18} />
        <stop offset="100%" stopColor={targetColor} stopOpacity={0.18} />
        </linearGradient>
      </defs>
      <path
        d={`
          M${sourceX},${sourceY}
          C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}
        `}
        stroke={`url(#linkGradient${index})`}
        strokeWidth={Math.max(linkWidth, 1)}
        fill="none"
        className="transition-all duration-300 hover:opacity-100 cursor-pointer"
      />
    </Layer>
  );
};

function hasReportsData(model: ReportsModel | null): boolean {
  if (!model) return false;
  return model.hasCurrentData || model.categorySpending.length > 0 || model.timeSeries.length > 0;
}

function deserializeModel(model: ReportsMetricsResponse['model']): ReportsModel {
  return {
    ...model,
    timeSeries: model.timeSeries.map((item) => ({
      ...item,
      from: new Date(item.from),
      to: new Date(item.to)
    })),
    recurringDetected: model.recurringDetected.map((item) => ({
      ...item,
      nextExpectedDate: item.nextExpectedDate ? new Date(item.nextExpectedDate) : null
    }))
  };
}

export function Reports({ hideValues }: ReportsProps) {
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [periodLabel, setPeriodLabel] = React.useState('Março 2026');
  const [model, setModel] = React.useState<ReportsModel | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch('/api/metrics/official?view=reports&preset=3M', { cache: 'no-store' });
      const { data, errorMessage } = await parseApiResponse<ReportsMetricsResponse | { error?: unknown }>(response);

      if (errorMessage) throw new Error(errorMessage);
      if (!response.ok || !data || !('view' in data) || data.view !== 'reports') {
        throw new Error(extractApiError(data, 'Não foi possível carregar os relatórios.'));
      }

      setPeriodLabel(data.period.current.label || 'Período atual');
      setModel(deserializeModel(data.model));
    } catch (loadError) {
      setModel(null);
      setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar relatórios.');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const categoryDistribution = React.useMemo(() => {
    return (model?.categorySpending ?? []).map((item) => ({
      name: item.name,
      value: item.value,
      color: item.color
    }));
  }, [model]);

  const savingsRate = React.useMemo(() => {
    if (!model || model.currentTotals.income <= 0) return 0;
    return Number(((model.currentTotals.net / model.currentTotals.income) * 100).toFixed(1));
  }, [model]);

  const previousSavingsRate = React.useMemo(() => {
    if (!model || model.previousTotals.income <= 0) return 0;
    return Number(((model.previousTotals.net / model.previousTotals.income) * 100).toFixed(1));
  }, [model]);

  const positiveMonths = React.useMemo(
    () => (model?.timeSeries ?? []).filter((item) => item.net > 0).length,
    [model]
  );

  const variableExpenses = React.useMemo(() => {
    if (!model) return 0;
    const recurringTotal = model.recurringDetected.reduce((sum, item) => sum + item.estimatedMonthlyCost, 0);
    return Math.max(0, model.currentTotals.expense - recurringTotal);
  }, [model]);

  const sankeyData = React.useMemo(() => {
    if (!model) return { nodes: [], links: [] };

    const nodes = model.sankey.nodes.map((node) => ({
      name: node.label,
      fill: node.color,
      value: node.displayValue ?? 0
    }));
    const nodeIndex = new Map(model.sankey.nodes.map((node, index) => [node.id, index]));
    const links = model.sankey.links
      .map((link) => ({
        source: nodeIndex.get(link.source) ?? 0,
        target: nodeIndex.get(link.target) ?? 0,
        value: link.value
      }))
      .filter((link) => Number.isFinite(link.source) && Number.isFinite(link.target));

    return { nodes, links };
  }, [model]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="glass-card h-[360px]" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <Skeleton className="glass-card h-[360px]" />
          <Skeleton className="glass-card h-[360px] lg:col-span-2" />
        </div>
        <Skeleton className="glass-card h-[420px]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card p-8 text-center">
        <p className="text-sm text-error mb-4">{error}</p>
        <button
          onClick={() => void load()}
          className="bg-primary hover:bg-primary/90 text-foreground px-4 py-2 rounded-lg font-medium transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    );
  }

  if (!hasReportsData(model)) {
    return (
      <div className="glass-card">
        <EmptyState
          icon={Filter}
          title="Sem dados para relatórios"
          description="Importe transações ou selecione outro período para gerar os gráficos e indicadores."
        />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300 pb-20">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mb-1">Relatórios</h1>
          <p className="text-muted-foreground text-sm">Analytics profissional e insights detalhados</p>
        </div>
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button className="glass-card hover:bg-secondary text-foreground px-4 py-2 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors flex-1 sm:flex-none" title={periodLabel}>
            <Calendar size={18} />
            <span className="hidden sm:inline">{periodLabel}</span>
          </button>
          <button onClick={() => window.print()} className="bg-primary hover:bg-primary/90 text-foreground px-4 py-2 rounded-lg flex items-center justify-center gap-2 font-medium transition-colors shadow-sm flex-1 sm:flex-none">
            <Download size={18} />
            <span className="hidden sm:inline">Exportar PDF</span>
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="glass-card p-6 sm:p-8 flex flex-col">
          <h2 className="text-[11px] text-muted-foreground font-bold uppercase tracking-widest mb-6">Distribuição por Categoria</h2>
          <div className="h-[240px] w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={85}
                  paddingAngle={6}
                  dataKey="value"
                  stroke="none"
                  cornerRadius={4}
                >
                  {categoryDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={REPORTS_TOOLTIP_STYLE}
                  itemStyle={REPORTS_TOOLTIP_ITEM_STYLE}
                  formatter={(value) => `R$ ${Number(value ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-8 space-y-3 flex-1">
            {categoryDistribution.map((item) => (
              <div key={item.name} className="flex items-center justify-between text-xs p-2 rounded-lg hover:bg-secondary transition-colors">
                <div className="flex items-center gap-2.5">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                  <span className="text-muted-foreground font-medium">{item.name}</span>
                </div>
                <span className="font-mono font-semibold text-foreground">{formatCurrency(item.value, hideValues)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2 glass-card p-6 sm:p-8 flex flex-col">
          <h2 className="text-[11px] text-muted-foreground font-bold uppercase tracking-widest mb-6">Comparativo Mês a Mês</h2>
          <div className="flex-1 min-h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={model?.timeSeries ?? []} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={REPORTS_GRID_STROKE} vertical={false} />
                <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} dy={10} />
                <YAxis hide />
                <Tooltip
                  contentStyle={REPORTS_TOOLTIP_STYLE}
                  itemStyle={REPORTS_TOOLTIP_ITEM_STYLE}
                  cursor={{ fill: REPORTS_CURSOR_FILL }}
                  formatter={(value) => `R$ ${Number(value ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`}
                />
                <Bar dataKey="income" name="Receitas" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} maxBarSize={40} />
                <Bar dataKey="expense" name="Despesas" fill="hsl(var(--error))" radius={[4, 4, 0, 0]} maxBarSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        <div className="glass-card p-6 flex flex-col justify-center">
          <div className="p-2.5 bg-primary/10 rounded-xl text-primary w-fit mb-4 border border-primary/20 shadow-sm">
            <Zap size={20} />
          </div>
          <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Taxa de Poupança</h3>
          <div className="font-mono text-3xl font-semibold tracking-tight text-foreground">{savingsRate.toFixed(1)}%</div>
          <p className="text-[11px] text-success font-bold tracking-wide mt-2 bg-success/10 px-2 py-1 rounded-md border border-success/20 inline-block w-fit">
            {(savingsRate - previousSavingsRate) >= 0 ? '+' : ''}{(savingsRate - previousSavingsRate).toFixed(1)}% vs mês anterior
          </p>
        </div>
        <div className="glass-card p-6 flex flex-col justify-center">
          <div className="p-2.5 bg-success/10 rounded-xl text-success w-fit mb-4 border border-success/20 shadow-sm">
            <Target size={20} />
          </div>
          <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Atingimento de Metas</h3>
          <div className="font-mono text-3xl font-semibold tracking-tight text-foreground">
            {model?.timeSeries.length ? Math.round((positiveMonths / model.timeSeries.length) * 100) : 0}%
          </div>
          <p className="text-[11px] text-muted-foreground font-medium tracking-wide mt-2">
            {positiveMonths} de {model?.timeSeries.length ?? 0} meses positivos
          </p>
        </div>
        <div className="glass-card p-6 flex flex-col justify-center">
          <div className="p-2.5 bg-warning/10 rounded-xl text-warning w-fit mb-4 border border-warning/20 shadow-sm">
            <TrendingUp size={20} />
          </div>
          <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">ROI Médio</h3>
          <div className="font-mono text-3xl font-semibold tracking-tight text-foreground">
            {model?.cashSummary.cashBalance ? ((model.currentTotals.net / Math.max(model.cashSummary.cashBalance, 1)) * 100).toFixed(1) : '0.0'}%
          </div>
          <p className="text-[11px] text-muted-foreground font-medium tracking-wide mt-2">Carteira de investimentos</p>
        </div>
        <div className="glass-card p-6 flex flex-col justify-center">
          <div className="p-2.5 bg-secondary rounded-xl text-foreground w-fit mb-4 border border-border shadow-sm">
            <Filter size={20} />
          </div>
          <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Gastos Variáveis</h3>
          <div className="font-mono text-3xl font-semibold tracking-tight text-foreground">{formatCurrency(variableExpenses, hideValues)}</div>
          <p className="text-[11px] text-error font-bold tracking-wide mt-2 bg-error/10 px-2 py-1 rounded-md border border-error/20 inline-block w-fit">
            {model ? `${model.recurringDetected.length} recorrências detectadas` : '0 recorrências'}
          </p>
        </div>
      </div>

      <div className="glass-card p-6 sm:p-8 hidden md:block">
        <h2 className="text-[11px] text-muted-foreground font-bold uppercase tracking-widest mb-8">Fluxo de Receitas e Despesas</h2>
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <Sankey
              data={sankeyData}
              nodePadding={50}
              nodeWidth={12}
              margin={{ left: 20, right: 20, top: 20, bottom: 20 }}
              link={<CustomLink />}
              node={(props: SankeyNodeRendererProps) => <CustomNode {...props} hideValues={hideValues} />}
            >
                <Tooltip
                contentStyle={REPORTS_TOOLTIP_STYLE}
                itemStyle={REPORTS_TOOLTIP_ITEM_STYLE}
                formatter={(value) => formatCurrency(Number(value ?? 0), hideValues)}
              />
            </Sankey>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

