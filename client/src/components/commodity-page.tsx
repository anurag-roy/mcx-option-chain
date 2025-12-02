import { OptionsCard } from '@client/components/options-table/options-card';
import { Card, CardContent } from '@client/components/ui/card';
import { useWebSocketContext } from '@client/contexts/websocket-context';
import { useEffect, useMemo } from 'react';

interface TableConfig {
  name: string;
  symbols: readonly string[];
}

interface CommodityPageProps {
  title: string;
  tables: readonly TableConfig[];
}

export function CommodityPage({ title, tables }: CommodityPageProps) {
  const { optionChainData, isConnected, subscribe } = useWebSocketContext();

  // Extract all symbols from tables
  const symbols = useMemo(() => {
    const allSymbols = new Set<string>();
    for (const table of tables) {
      for (const symbol of table.symbols) {
        allSymbols.add(symbol);
      }
    }
    return Array.from(allSymbols);
  }, [tables]);

  // Subscribe to symbols when component mounts or symbols change
  useEffect(() => {
    if (symbols.length > 0) {
      subscribe(symbols);
      console.log(`[${title}] Subscribing to symbols:`, symbols);
    }
  }, [symbols, subscribe, title]);

  return (
    <div className='px-4'>
      {/* Page Header */}
      <div className='container mx-auto mb-6 px-4'>
        <h1 className='text-3xl font-bold'>{title}</h1>
        <p className='text-muted-foreground mt-2'>Real-time option chain data and analytics</p>
      </div>

      {/* Content */}
      {!isConnected ? (
        <Card>
          <CardContent className='flex items-center justify-center py-16'>
            <div className='text-center'>
              <p className='text-muted-foreground text-lg font-medium'>Connecting to server...</p>
              <p className='text-muted-foreground mt-1 text-sm'>Option chain data will appear here once connected</p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className='grid min-h-0 flex-1 grid-cols-1 gap-6 xl:grid-cols-2'>
          {tables.map((table) => (
            <OptionsCard key={table.name} name={table.name} symbols={table.symbols} optionChainData={optionChainData} />
          ))}
        </div>
      )}
    </div>
  );
}
