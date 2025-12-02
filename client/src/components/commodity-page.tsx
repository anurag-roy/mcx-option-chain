import { SymbolTable } from '@client/components/symbol-table';
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
  const hasData = Object.keys(optionChainData).length > 0;

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
    <div className='flex flex-col px-4'>
      {/* Content */}
      {!hasData ? (
        <div className='flex flex-1 items-center justify-center rounded-lg border border-dashed'>
          <div className='text-center'>
            <p className='text-muted-foreground text-lg font-medium'>
              {isConnected ? 'Waiting for data...' : 'Connecting to server...'}
            </p>
            <p className='text-muted-foreground text-sm'>Option chain data will appear here once available</p>
          </div>
        </div>
      ) : (
        <div className='grid min-h-0 flex-1 grid-cols-2 gap-6'>
          {tables.map((table) => (
            <SymbolTable key={table.name} name={table.name} symbols={table.symbols} optionChainData={optionChainData} />
          ))}
        </div>
      )}
    </div>
  );
}
