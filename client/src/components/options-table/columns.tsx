import { cn } from '@client/lib/utils';
import type { OptionChain } from '@client/types/option-chain';
import type { ColumnDef, RowData } from '@tanstack/react-table';
import { format } from 'date-fns';
import { PlusCircleIcon } from 'lucide-react';
import { DataTableColumnHeader } from './column-header';

// Extend TanStack Table meta to include our callback
declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface TableMeta<TData extends RowData> {
    onSelectOrder?: (option: OptionChain) => void;
    onSelectInsight?: (option: OptionChain) => void;
    expiryRankByDate?: ReadonlyMap<string, number>;
  }
}

const green = 'bg-emerald-50/60 text-emerald-800 ring-emerald-100 dark:bg-emerald-900/10 dark:text-emerald-500';
const red = 'bg-red-50/60 text-red-800 ring-red-100 dark:bg-red-900/10 dark:text-red-500';

export const columns: ColumnDef<OptionChain>[] = [
  {
    id: 'instrument',
    header: 'Ins',
    accessorFn: (row) => row.name,
    cell: ({ row }) => {
      return <div className='p-2 pl-4'>{row.original.name}</div>;
    },
  },
  {
    id: 'expiry',
    header: 'Expiry',
    accessorFn: (row) => row.expiry,
    cell: ({ row, table }) => {
      const expiryRank = table.options.meta?.expiryRankByDate?.get(row.original.expiry);

      return (
        <div
          className={cn(
            'p-2 pl-4',
            expiryRank === 1 && 'bg-violet-50/60 text-violet-800 dark:bg-violet-900/20 dark:text-violet-500',
            expiryRank === 2 && 'bg-fuchsia-50/60 text-fuchsia-800 dark:bg-fuchsia-900/20 dark:text-fuchsia-500'
          )}
        >
          {format(new Date(row.original.expiry), 'dd MMM')}
        </div>
      );
    },
  },
  {
    id: 'strike',
    header: 'Strike',
    accessorFn: (row) => row.strike,
    cell: ({ row, table }) => {
      const label = `${row.original.strike} ${row.original.instrumentType}`;

      return (
        <button
          type='button'
          className='focus-visible:ring-ring flex min-h-10 w-full items-center p-2 pl-4 text-left font-medium text-blue-600 underline decoration-blue-600/50 underline-offset-4 transition-colors hover:text-blue-700 hover:decoration-blue-700 focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset active:scale-[0.96] dark:text-blue-400 dark:decoration-blue-400/50 dark:hover:text-blue-300 dark:hover:decoration-blue-300'
          onClick={() => table.options.meta?.onSelectInsight?.(row.original)}
          aria-label={`Open Black-76 insight for ${row.original.tradingsymbol}`}
        >
          {label}
        </button>
      );
    },
  },
  // {
  //   accessorKey: 'underlyingLtp',
  //   header: 'LTP',
  //   cell: ({ row }) => {
  //     const ltp = row.original.underlyingLtp;
  //     return <div className='p-2 font-semibold tabular-nums'>{ltp.toFixed(2)}</div>;
  //   },
  // },
  {
    id: 'dv',
    header: 'DV',
    cell: ({ row }) => {
      const dv = row.original.dv;
      return (
        <div className='bg-yellow-50/60 p-2 text-center text-yellow-800 tabular-nums dark:bg-yellow-900/20 dark:text-yellow-500'>
          {dv ? (dv * 100).toFixed(2) : '-'}
        </div>
      );
    },
  },
  {
    accessorKey: 'bid',
    header: 'Buyer Price',
    cell: ({ row }) => <div className='p-2 text-right tabular-nums'>{row.original.bid.toFixed(2)}</div>,
  },
  {
    accessorKey: 'returnValue',
    header: ({ table, column }) => (
      <DataTableColumnHeader table={table} column={column} title='RV' tooltip='Return Value' />
    ),
    cell: ({ row, table }) =>
      row.original.returnValue ? (
        <button
          type='button'
          className={cn(
            'flex w-full cursor-pointer items-center justify-between gap-1 p-2 font-semibold tabular-nums transition-opacity hover:opacity-80',
            row.original.returnValue >= 0 ? green : red
          )}
          onClick={() => table.options.meta?.onSelectOrder?.(row.original)}
        >
          <PlusCircleIcon className='h-4 w-4 shrink-0' />
          <span className='rounded-full px-2 py-px tabular-nums ring-1 ring-gray-400 dark:ring-gray-600'>
            {(row.original.returnValue * 100).toFixed(2)}
          </span>
        </button>
      ) : (
        <div className='p-2 text-right'>-</div>
      ),
    sortingFn: (rowA, rowB) => rowA.original.returnValue - rowB.original.returnValue,
  },
  {
    accessorKey: 'strikePosition',
    header: ({ table, column }) => (
      <DataTableColumnHeader table={table} column={column} title='SP' tooltip='Strike Price' />
    ),
    cell: ({ row }) => (
      <div
        className={cn(
          'p-1 pr-4 text-right font-semibold',
          row.original.strikePosition > 30 ? 'text-red-800 dark:text-red-500' : 'text-emerald-800 dark:text-emerald-500'
        )}
      >
        <span className='rounded-full px-2 py-0.5 tabular-nums ring-1 ring-gray-400 dark:ring-gray-600'>
          {row.original.strikePosition.toFixed(2)}
        </span>
      </div>
    ),
    sortingFn: (rowA, rowB) => rowA.original.strikePosition - rowB.original.strikePosition,
  },
  {
    id: 'delta',
    header: ({ table, column }) => <DataTableColumnHeader table={table} column={column} title='Delta (Δ)' />,
    accessorFn: (row) => row.delta,
    cell: ({ row }) => {
      const { delta } = row.original;

      if (!delta || isNaN(delta)) {
        return (
          <div className='bg-gray-50/60 p-2 text-center text-gray-500 dark:bg-gray-900/20 dark:text-gray-400'>N/A</div>
        );
      }

      const deltaColor =
        delta >= 0
          ? 'bg-emerald-50/60 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-500'
          : 'bg-red-50/60 text-red-800 dark:bg-red-900/20 dark:text-red-500';

      return (
        <div className={cn('p-2 text-center font-medium tabular-nums', deltaColor)}>{(delta * 100).toFixed(7)}</div>
      );
    },
    sortingFn: (rowA, rowB) => Math.abs(rowA.original.delta ?? 0) - Math.abs(rowB.original.delta ?? 0),
  },
  {
    id: 'sigmaXI',
    header: 'σₓᵢ %',
    cell: ({ row }) => {
      const { sigmaXI } = row.original;
      if (!sigmaXI || sigmaXI <= 0) {
        return (
          <div className='bg-gray-50/60 p-2 text-center text-gray-500 dark:bg-gray-900/20 dark:text-gray-400'>N/A</div>
        );
      }
      return (
        <div className='bg-blue-50/60 p-2 text-center font-medium text-blue-800 tabular-nums dark:bg-blue-900/20 dark:text-blue-500'>
          {sigmaXI.toFixed(3)}%
        </div>
      );
    },
  },
  // {
  //   accessorKey: 'orderMargin',
  //   header: 'Order Margin',
  //   cell: ({ row }) => (
  //     <div className="p-2 text-right tabular-nums">{row.original.orderMargin.toFixed(2)}</div>
  //   ),
  // },
  {
    accessorKey: 'sellValue',
    header: 'Sell Value',
    cell: ({ row }) => <div className='p-2 text-right tabular-nums'>{row.original.sellValue.toFixed(2)}</div>,
  },
];

export const numericCols = [
  'underlyingLtp',
  'bid',
  'returnValue',
  'strikePosition',
  'sellValue',
  'orderMargin',
  'delta',
  'sigmaXI',
];
