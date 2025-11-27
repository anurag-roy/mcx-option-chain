import { cn } from '@client/lib/utils';
import type { OptionChain } from '@client/types/option-chain';
import type { ColumnDef } from '@tanstack/react-table';
import { format } from 'date-fns';
import { DataTableColumnHeader } from './column-header';

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
    cell: ({ row }) => {
      return <div className='p-2 pl-4'>{format(new Date(row.original.expiry), 'dd MMM')}</div>;
    },
  },
  {
    id: 'strike',
    header: 'Strike',
    accessorFn: (row) => row.strike,
    cell: ({ row }) => {
      return (
        <div className='p-2 pl-4'>
          {row.original.strike} {row.original.instrumentType}
        </div>
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
    header: ({ table, column }) => <DataTableColumnHeader table={table} column={column} title='Return Value' />,
    cell: ({ row }) => (
      <div className={cn('p-2 text-right font-semibold tabular-nums', row.original.returnValue > 0 ? green : red)}>
        {row.original.returnValue ? (row.original.returnValue * 100).toFixed(2) : '-'}
      </div>
    ),
    sortingFn: (rowA, rowB) => rowA.original.returnValue - rowB.original.returnValue,
  },
  {
    accessorKey: 'strikePosition',
    header: ({ table, column }) => <DataTableColumnHeader table={table} column={column} title='Strike Position' />,
    cell: ({ row }) => (
      <div
        className={cn(
          'p-1 pr-4 text-right font-semibold',
          row.original.strikePosition > 30 ? 'text-red-800 dark:text-red-500' : 'text-emerald-800 dark:text-emerald-500'
        )}
      >
        <span className='rounded-full px-2 py-1 tabular-nums ring-1 ring-gray-400 dark:ring-gray-600'>
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
    sortingFn: (rowA, rowB) => (rowA.original.delta ?? 0) - (rowB.original.delta ?? 0),
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
        <div className='bg-indigo-50/60 p-2 text-center text-indigo-800 tabular-nums dark:bg-indigo-900/20 dark:text-indigo-500'>
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
