import { columns } from '@client/components/options-table/columns';
import { DataTable } from '@client/components/options-table/data-table';
import { OrderModal } from '@client/components/order-modal';
import { Card, CardContent, CardHeader, CardTitle } from '@client/components/ui/card';
import { useNotifications } from '@client/contexts/notification-context';
import type { OptionChain, OptionChainData } from '@client/types/option-chain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

interface OptionsCardProps {
  name: string;
  symbols: readonly string[];
  optionChainData: OptionChainData;
}

export function OptionsCard({ name, symbols, optionChainData }: OptionsCardProps) {
  // Store only the token, not the entire option object
  const [selectedToken, setSelectedToken] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { addNotification } = useNotifications();

  // Track the previous highest RV option
  const prevHighestRef = useRef<{ token: number; rv: number; symbol: string } | null>(null);

  // Derive the live option from current data (updates when optionChainData updates)
  const selectedOption = selectedToken !== null ? (optionChainData[selectedToken] ?? null) : null;

  const filteredData = useMemo(() => {
    const allOptions = Object.values(optionChainData);
    return allOptions.filter((option) => symbols.includes(option.name)) as OptionChain[];
  }, [optionChainData, symbols]);
  const length = filteredData.length;

  // Track highest Return Value and notify when it changes to a different instrument
  useEffect(() => {
    if (filteredData.length === 0) return;

    // Find the option with highest return value
    const highest = filteredData.reduce((max, opt) => (opt.returnValue > max.returnValue ? opt : max));

    const prev = prevHighestRef.current;

    // Only notify if:
    // 1. We had a previous highest (not first load)
    // 2. The highest RV instrument changed
    // 3. The new highest RV is greater than the previous
    if (prev && highest.instrumentToken !== prev.token && highest.returnValue > prev.rv) {
      addNotification(
        `[${highest.tradingsymbol}] New highest return value: ${highest.returnValue.toFixed(2)}`,
        'important'
      );
    }

    // Update the ref with current highest
    prevHighestRef.current = {
      token: highest.instrumentToken,
      rv: highest.returnValue,
      symbol: highest.tradingsymbol,
    };
  }, [filteredData, addNotification]);

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
      <Card key={name} className='h-fit gap-2 pt-4 pb-0'>
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
