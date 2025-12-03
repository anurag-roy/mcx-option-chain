import { OrderModal } from '@client/components/order-modal';
import { columns } from '@client/components/options-table/columns';
import { DataTable } from '@client/components/options-table/data-table';
import { Card, CardContent, CardHeader, CardTitle } from '@client/components/ui/card';
import type { OptionChain, OptionChainData } from '@client/types/option-chain';
import { useCallback, useMemo, useState } from 'react';

interface OptionsCardProps {
  name: string;
  symbols: readonly string[];
  optionChainData: OptionChainData;
}

export function OptionsCard({ name, symbols, optionChainData }: OptionsCardProps) {
  // Store only the token, not the entire option object
  const [selectedToken, setSelectedToken] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Derive the live option from current data (updates when optionChainData updates)
  const selectedOption = selectedToken !== null ? optionChainData[selectedToken] ?? null : null;

  const filteredData = useMemo(() => {
    const allOptions = Object.values(optionChainData);
    return allOptions.filter((option) => symbols.includes(option.name)) as OptionChain[];
  }, [optionChainData, symbols]);
  const length = filteredData.length;

  const handleSelectOption = useCallback((option: OptionChain) => {
    setSelectedToken(option.instrumentToken);
    setIsModalOpen(true);
  }, []);

  const handleModalClose = useCallback((open: boolean) => {
    setIsModalOpen(open);
    if (!open) {
      // Keep selectedToken around briefly for close animation
      setTimeout(() => setSelectedToken(null), 200);
    }
  }, []);

  return (
    <>
      <Card key={name} className='gap-2 pt-4 pb-0'>
        <CardHeader className='px-4'>
          <CardTitle>
            {name} ({length} {length === 1 ? 'instrument' : 'instruments'})
          </CardTitle>
        </CardHeader>
        <CardContent className='pt-0'>
          <div className='-mx-6 border-t'>
            <DataTable columns={columns} data={filteredData} onSelectOption={handleSelectOption} />
          </div>
        </CardContent>
      </Card>

      {/* Single OrderModal instance for this card */}
      <OrderModal option={selectedOption} open={isModalOpen} onOpenChange={handleModalClose} />
    </>
  );
}
