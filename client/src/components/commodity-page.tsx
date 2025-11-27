import { SymbolTable } from '@client/components/symbol-table';
import { Button } from '@client/components/ui/button';
import { useWebSocketContext } from '@client/contexts/websocket-context';
import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';

interface TableConfig {
  name: string;
  symbols: readonly string[];
}

interface CommodityPageProps {
  title: string;
  tables: readonly TableConfig[];
}

export function CommodityPage({ title, tables }: CommodityPageProps) {
  const { optionChainData, isConnected } = useWebSocketContext();
  const hasData = Object.keys(optionChainData).length > 0;

  return (
    <div className='flex h-[calc(100vh-6rem)] flex-col'>
      {/* Header */}
      <div className='mb-4 flex items-center justify-between'>
        <div className='flex items-center gap-4'>
          <Link to='/'>
            <Button variant='ghost' size='icon' className='h-8 w-8'>
              <ArrowLeft className='h-4 w-4' />
            </Button>
          </Link>
          <h1 className='text-2xl font-bold'>{title}</h1>
        </div>
        <div className='flex items-center gap-2'>
          <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
          <span className='text-muted-foreground text-sm'>{isConnected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </div>

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
