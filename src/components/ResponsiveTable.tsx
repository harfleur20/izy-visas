import { ReactNode } from "react";

interface Column {
  key: string;
  header: string;
  /** Hide on mobile card view */
  hideOnMobile?: boolean;
  /** Priority columns shown first in mobile cards */
  priority?: boolean;
  render?: (value: any, row: any) => ReactNode;
}

interface ResponsiveTableProps {
  columns: Column[];
  data: any[];
  onRowClick?: (row: any) => void;
  rowClassName?: (row: any) => string;
  mobileActions?: (row: any) => ReactNode;
}

export function ResponsiveTable({
  columns,
  data,
  onRowClick,
  rowClassName,
  mobileActions,
}: ResponsiveTableProps) {
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="font-syne text-[0.6rem] font-bold tracking-wider uppercase text-muted px-3.5 py-2 text-left border-b border-border whitespace-nowrap"
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => (
              <tr
                key={i}
                onClick={() => onRowClick?.(row)}
                className={`${onRowClick ? "cursor-pointer" : ""} transition-colors hover:bg-foreground/[0.022] ${rowClassName?.(row) || ""}`}
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-3.5 py-2.5 text-xs border-b border-foreground/[0.03]">
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-3">
        {data.map((row, i) => (
          <div
            key={i}
            onClick={() => onRowClick?.(row)}
            className={`bg-panel border border-border rounded-xl p-4 ${onRowClick ? "cursor-pointer active:scale-[0.99]" : ""} transition-all ${rowClassName?.(row) || ""}`}
          >
            {columns
              .filter((col) => !col.hideOnMobile)
              .map((col) => (
                <div key={col.key} className="flex items-center justify-between py-1.5 border-b border-foreground/[0.04] last:border-b-0">
                  <span className="text-[0.7rem] text-muted-foreground font-syne uppercase tracking-wider">{col.header}</span>
                  <span className="text-xs text-foreground text-right max-w-[60%]">
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </span>
                </div>
              ))}
            {mobileActions && (
              <div className="mt-3 pt-2 border-t border-foreground/[0.06]">
                {mobileActions(row)}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}
