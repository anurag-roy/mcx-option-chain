import { columns, DataTable } from '@client/components/options-table';
import type { OptionChain, OptionChainData } from '@client/types/option-chain';
import { useMemo } from 'react';

interface SymbolTableProps {
  name: string;
  symbols: readonly string[];
  optionChainData: OptionChainData;
}

export function SymbolTable({ name, symbols, optionChainData }: SymbolTableProps) {
  const filteredData = useMemo(() => {
    const allOptions = Object.values(optionChainData);
    return allOptions.filter((option) => symbols.includes(option.name)) as OptionChain[];
  }, [optionChainData, symbols]);

  return (
    <div className='flex h-full flex-col'>
      <div className='mb-4 flex items-center justify-between'>
        <h2 className='text-xl font-semibold'>{name}</h2>
        <span className='text-muted-foreground text-sm'>{filteredData.length} instruments</span>
      </div>
      <div className='min-h-0 flex-1'>
        <DataTable columns={columns} data={filteredData} />
      </div>
    </div>
  );
}
