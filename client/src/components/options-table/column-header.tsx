import { Button } from '@client/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@client/components/ui/dropdown-menu';
import { cn } from '@client/lib/utils';
import type { Column, Table } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, RotateCcw } from 'lucide-react';

interface DataTableColumnHeaderProps<TData, TValue> extends React.HTMLAttributes<HTMLDivElement> {
  table: Table<TData>;
  column: Column<TData, TValue>;
  title: string;
  tooltip?: string;
}

export function DataTableColumnHeader<TData, TValue>({
  table,
  column,
  title,
  className,
  tooltip,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>;
  }

  const isSorted = column.getIsSorted();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant='ghost'
          size='sm'
          tooltip={tooltip}
          className={cn(
            'data-[state=open]:bg-accent -ml-2 w-full text-xs',
            isSorted && 'font-semibold text-blue-600 dark:text-blue-400'
          )}
        >
          <span>{title}</span>
          {column.getIsSorted() === 'desc' ? (
            <ArrowDown />
          ) : column.getIsSorted() === 'asc' ? (
            <ArrowUp />
          ) : (
            <ArrowUpDown />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start'>
        <DropdownMenuItem
          onClick={() => {
            column.toggleSorting(false);
            table.resetPageIndex();
          }}
        >
          <ArrowUp className='text-muted-foreground/70 mr-2 h-3.5 w-3.5' />
          Asc
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            column.toggleSorting(true);
            table.resetPageIndex();
          }}
        >
          <ArrowDown className='text-muted-foreground/70 mr-2 h-3.5 w-3.5' />
          Desc
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            column.clearSorting();
            table.resetPageIndex();
          }}
        >
          <RotateCcw className='text-muted-foreground/70 mr-2 h-3.5 w-3.5' />
          Reset
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
