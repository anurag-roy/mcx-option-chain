import { Button } from '@client/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@client/components/ui/dropdown-menu';
import { cn } from '@client/lib/utils';
import type { Column } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, ArrowUpDown, RotateCcw } from 'lucide-react';

interface DataTableColumnHeaderProps<TData, TValue> extends React.HTMLAttributes<HTMLDivElement> {
  column: Column<TData, TValue>;
  title: string;
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  title,
  className,
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort()) {
    return <div className={cn(className)}>{title}</div>;
  }

  const isSorted = column.getIsSorted();

  return (
    <div className={cn('flex items-center space-x-2', className)}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant='ghost'
            size='sm'
            className={cn(
              'data-[state=open]:bg-accent ml-auto h-8',
              isSorted && 'font-semibold text-blue-600 dark:text-blue-400'
            )}
          >
            <span>{title}</span>
            {isSorted === 'desc' ? (
              <ArrowDown className='ml-2 h-4 w-4' />
            ) : isSorted === 'asc' ? (
              <ArrowUp className='ml-2 h-4 w-4' />
            ) : (
              <ArrowUpDown className='ml-2 h-4 w-4' />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align='start'>
          <DropdownMenuItem onSelect={() => column.toggleSorting(false)}>
            <ArrowUp className='text-muted-foreground/70 mr-2 h-3.5 w-3.5' />
            Asc
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => column.toggleSorting(true)}>
            <ArrowDown className='text-muted-foreground/70 mr-2 h-3.5 w-3.5' />
            Desc
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => column.clearSorting()}>
            <RotateCcw className='text-muted-foreground/70 mr-2 h-3.5 w-3.5' />
            Reset
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
