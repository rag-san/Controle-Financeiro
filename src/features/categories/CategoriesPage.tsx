import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Plus, ChevronDown, ChevronRight, ArrowRightLeft } from 'lucide-react';
import { extractApiError, parseApiResponse } from '@/lib/client/api-response';
import type { CategoryDTO } from '@/lib/types';
import type { CategoryMonthAggregates } from '@/src/features/categories/utils/categoryAggregates';
import { EmptyState } from '@/src/app-shell/components/EmptyState';
import { NewCategoryModal } from './components/NewCategoryModal';
import { Skeleton } from '@/src/app-shell/components/ShellSkeleton';
import { formatCurrency, cn } from '@/src/app-shell/utils';

interface CategoriesProps {
  hideValues: boolean;
}

export { Categories as CategoriesPage };

interface CategoryRowNode {
  id: string;
  name: string;
  spent: number;
  color: string;
  subcategories?: CategoryRowNode[];
}

type CategoriesMetricsResponse = {
  view: 'categories';
  month: string;
  aggregates: CategoryMonthAggregates & {
    monthInterval: {
      start: string;
      end: string;
    };
  };
};

function buildCategoryRows(categories: CategoryDTO[], metrics: CategoriesMetricsResponse['aggregates'] | null): CategoryRowNode[] {
  const spendMap = new Map<string, number>();
  const groupTotals = new Map<string, number>();

  for (const item of metrics?.list ?? []) {
    if (item.categoryId) {
      spendMap.set(item.categoryId, item.value);
    }
  }

  for (const group of metrics?.groups ?? []) {
    groupTotals.set(group.id, group.total);
  }

  const childrenByParent = new Map<string, CategoryDTO[]>();
  for (const category of categories) {
    if (!category.parentId) continue;
    const bucket = childrenByParent.get(category.parentId) ?? [];
    bucket.push(category);
    childrenByParent.set(category.parentId, bucket);
  }

  return categories
    .filter((category) => !category.parentId)
    .map((root) => {
      const children = (childrenByParent.get(root.id) ?? [])
        .map<CategoryRowNode>((child) => ({
          id: child.id,
          name: child.name,
          spent: spendMap.get(child.id) ?? 0,
          color: child.color || root.color
        }))
        .sort((left, right) => right.spent - left.spent);

      return {
        id: root.id,
        name: root.name,
        spent: children.length > 0 ? groupTotals.get(root.id) ?? children.reduce((sum, child) => sum + child.spent, 0) : spendMap.get(root.id) ?? 0,
        color: root.color,
        subcategories: children.length > 0 ? children : undefined
      };
    })
    .sort((left, right) => right.spent - left.spent || left.name.localeCompare(right.name));
}

export function Categories({ hideValues }: CategoriesProps) {
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [categories, setCategories] = useState<CategoryDTO[]>([]);
  const [metrics, setMetrics] = useState<CategoriesMetricsResponse['aggregates'] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const monthKey = useMemo(() => format(new Date(), 'yyyy-MM'), []);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError('');

    try {
      const [categoriesResponse, metricsResponse] = await Promise.all([
        fetch('/api/categories', { cache: 'no-store' }),
        fetch(`/api/metrics/official?view=categories&month=${encodeURIComponent(monthKey)}`, { cache: 'no-store' })
      ]);

      const [{ data: categoriesData, errorMessage: categoriesError }, { data: metricsData, errorMessage: metricsError }] = await Promise.all([
        parseApiResponse<CategoryDTO[] | { error?: unknown }>(categoriesResponse),
        parseApiResponse<CategoriesMetricsResponse | { error?: unknown }>(metricsResponse)
      ]);

      if (categoriesError) throw new Error(categoriesError);
      if (!categoriesResponse.ok || !categoriesData || !Array.isArray(categoriesData)) {
        throw new Error(extractApiError(categoriesData, 'Não foi possível carregar as categorias.'));
      }

      if (metricsError) throw new Error(metricsError);
      if (!metricsResponse.ok || !metricsData || !('view' in metricsData) || metricsData.view !== 'categories') {
        throw new Error(extractApiError(metricsData, 'Não foi possível carregar o resumo das categorias.'));
      }

      setCategories(categoriesData);
      setMetrics(metricsData.aggregates);
    } catch (loadError) {
      setCategories([]);
      setMetrics(null);
      setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar categorias.');
    } finally {
      setLoading(false);
    }
  }, [monthKey]);

  useEffect(() => {
    void load();
  }, [load]);

  const rows = useMemo(() => buildCategoryRows(categories, metrics), [categories, metrics]);
  const totalSpent = metrics?.totalSpent ?? 0;

  const toggleCategory = (id: string) => {
    setExpandedCategories((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderCategoryRow = (category: CategoryRowNode, level: number = 0, parentColor?: string) => {
    const isExpanded = expandedCategories[category.id];
    const hasSubcategories = category.subcategories && category.subcategories.length > 0;
    const progress = totalSpent > 0 ? (category.spent / totalSpent) * 100 : 0;
    const categoryColor = parentColor || category.color || 'hsl(var(--muted-foreground))';

    return (
      <React.Fragment key={category.id}>
        <tr
          className={cn(
            'transition-colors group',
            hasSubcategories && 'cursor-pointer hover:bg-muted/30'
          )}
          onClick={() => hasSubcategories && toggleCategory(category.id)}
        >
          <td className="px-6 py-4 font-medium text-foreground" style={{ paddingLeft: `${level * 24 + 24}px` }}>
            <div className="flex items-center gap-3">
              {hasSubcategories && (
                isExpanded ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />
              )}
              {!hasSubcategories && <div className="w-4" />}
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-foreground" style={{ backgroundColor: categoryColor }}>
                {category.name[0]}
              </div>
              {category.name}
            </div>
          </td>
          <td className="px-6 py-4 text-right geist-mono font-medium text-foreground">
            {formatCurrency(category.spent, hideValues)}
          </td>
          <td className="px-6 py-4 w-64">
            <div className="flex items-center gap-3">
              <div className="h-1.5 flex-1 bg-secondary/40 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.min(progress, 100)}%`, backgroundColor: categoryColor }}
                />
              </div>
            </div>
          </td>
        </tr>
        {isExpanded && category.subcategories?.map((sub) => renderCategoryRow(sub, level + 1, categoryColor))}
      </React.Fragment>
    );
  };

  const renderCategoryCard = (category: CategoryRowNode, level: number = 0, parentColor?: string) => {
    const isExpanded = expandedCategories[category.id];
    const hasSubcategories = category.subcategories && category.subcategories.length > 0;
    const progress = totalSpent > 0 ? (category.spent / totalSpent) * 100 : 0;
    const categoryColor = parentColor || category.color || 'hsl(var(--muted-foreground))';

    return (
      <div key={category.id} className={cn('rounded-2xl border border-border/60 bg-muted/10 p-4', level > 0 && 'ml-3')}>
        <button
          type="button"
          className={cn('flex w-full items-start gap-3 text-left', hasSubcategories && 'cursor-pointer')}
          onClick={() => hasSubcategories && toggleCategory(category.id)}
        >
          <div className="flex items-center gap-2">
            {hasSubcategories ? (
              isExpanded ? <ChevronDown size={14} className="text-muted-foreground" /> : <ChevronRight size={14} className="text-muted-foreground" />
            ) : <div className="w-3.5" />}
            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] text-foreground shrink-0" style={{ backgroundColor: categoryColor }}>
              {category.name[0]}
            </div>
          </div>

          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-medium text-foreground">{category.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">{hasSubcategories ? 'Categoria com subcategorias' : 'Categoria principal'}</div>
              </div>
              <div className="geist-mono text-right text-sm font-medium text-foreground">{formatCurrency(category.spent, hideValues)}</div>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-secondary/40">
              <div className="h-full rounded-full" style={{ width: `${Math.min(progress, 100)}%`, backgroundColor: categoryColor }} />
            </div>
          </div>
        </button>
        {isExpanded && category.subcategories?.length ? (
          <div className="mt-3 space-y-3">
            {category.subcategories.map((sub) => renderCategoryCard(sub, level + 1, categoryColor))}
          </div>
        ) : null}
      </div>
    );
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <header className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="mb-1 text-3xl font-bold tracking-tight">Categorias</h1>
          <p className="text-muted-foreground text-sm">Organize seus gastos por categoria e subcategoria</p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 font-medium text-background transition-all duration-200 hover:scale-105 hover:bg-primary/90 active:scale-95 shadow-[0_0_15px_hsl(var(--primary) / 0.2)] hover:shadow-[0_0_25px_hsl(var(--primary) / 0.4)]"
        >
          <Plus size={18} />
          Nova Categoria
        </button>
      </header>

      <div className="glass-card overflow-hidden">
        {loading ? (
          <div className="p-6 space-y-3">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : error ? (
          <div className="p-8 text-center">
            <p className="text-sm text-error mb-4">{error}</p>
            <button
              onClick={() => void load()}
              className="bg-primary hover:bg-primary/90 text-background px-4 py-2 rounded-lg font-medium transition-colors"
            >
              Tentar novamente
            </button>
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={ArrowRightLeft}
            title="Nenhuma categoria encontrada"
            description="Crie categorias para organizar melhor seus gastos e receitas."
            actionLabel="Nova Categoria"
            onAction={() => setIsModalOpen(true)}
          />
        ) : (
          <>
            <div className="grid gap-3 p-4 md:hidden">
              {rows.map((category) => renderCategoryCard(category))}
            </div>
            <table className="hidden w-full text-left text-sm md:table">
            <thead className="text-[10px] text-muted-foreground font-bold uppercase tracking-widest border-b border-border/60 bg-muted/10">
              <tr>
                <th className="px-6 py-4">Nome</th>
                <th className="px-6 py-4 text-right">Gasto Atual</th>
                <th className="px-6 py-4">Progresso</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {rows.map((category) => renderCategoryRow(category))}
            </tbody>
            </table>
          </>
        )}
      </div>

      <NewCategoryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onCreated={() => {
          setIsModalOpen(false);
          void load();
        }}
      />
    </div>
  );
}

