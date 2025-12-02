import { columns } from '@client/components/options-table/columns';
import { DataTable } from '@client/components/options-table/data-table';
import { Card, CardContent, CardHeader, CardTitle } from '@client/components/ui/card';
import type { OptionChain, OptionChainData } from '@client/types/option-chain';
import { useMemo } from 'react';

interface OptionsCardProps {
  name: string;
  symbols: readonly string[];
  optionChainData: OptionChainData;
}

export function OptionsCard({ name, symbols, optionChainData }: OptionsCardProps) {
  const filteredData = useMemo(() => {
    const allOptions = Object.values(optionChainData);
    return allOptions.filter((option) => symbols.includes(option.name)) as OptionChain[];
  }, [optionChainData, symbols]);
  const length = filteredData.length;

  return (
    <Card key={name} className='gap-2 pt-4 pb-0'>
      <CardHeader className='px-4'>
        <CardTitle>
          {name} ({length} {length === 1 ? 'instrument' : 'instruments'})
        </CardTitle>
      </CardHeader>
      <CardContent className='pt-0'>
        <div className='-mx-6 border-t'>
          <DataTable columns={columns} data={filteredData} />
        </div>
      </CardContent>
    </Card>
  );
}
