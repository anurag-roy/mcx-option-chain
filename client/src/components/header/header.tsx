import { UserButton } from './user-button';

interface HeaderProps {
  isConnected: boolean;
}

export function Header({ isConnected }: HeaderProps) {
  return (
    <div className='border-border border-b py-4'>
      <header className='mx-auto flex max-w-6xl items-center justify-between px-4'>
        <div className='flex items-center gap-4'>
          <img src='/logo.png' alt='MCX logo' className='size-8' />
          <h1 className='text-2xl font-bold'>MCX Option Chain</h1>
        </div>

        <div className='flex items-center gap-4'>
          {/* Connection Status */}
          <div className='flex items-center gap-2'>
            <div className={`h-2 w-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`} />
            <span
              className={`text-sm font-medium ${
                isConnected ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'
              }`}
            >
              {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          <UserButton />
        </div>
      </header>
    </div>
  );
}
