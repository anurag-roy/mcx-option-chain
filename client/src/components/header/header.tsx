import { useUserMargin } from '@client/hooks/use-user-margin';
import { api } from '@client/lib/api';
import { cn } from '@client/lib/utils';
import { PAGE_CONFIGS } from '@client/types/option-chain';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from '@tanstack/react-router';
import { UserButton } from './user-button';

function formatMargin(value: number): string {
  const absValue = Math.abs(value);
  if (absValue >= 1_00_00_000) {
    // 1 crore or more - show in crores
    return `${(value / 1_00_00_000).toFixed(1)}Cr`;
  } else if (absValue >= 1_00_000) {
    // 10 lakh or more - show in lakhs
    return `${(value / 1_00_000).toFixed(1)}L`;
  } else if (absValue >= 1000) {
    // 1000 or more - show in thousands
    return `${(value / 1000).toFixed(1)}K`;
  }
  return value.toFixed(0);
}

interface HeaderProps {
  isConnected: boolean;
}

export function Header({ isConnected }: HeaderProps) {
  const location = useLocation();

  const { data: sdData } = useQuery({
    queryKey: ['sdMultiplier'],
    queryFn: async () => {
      const res = await api.settings['sd-multiplier'].$get();
      return res.json();
    },
  });

  const { data: marginData } = useUserMargin();

  return (
    <div className='border-border bg-background sticky top-0 z-10 border-b py-4'>
      <header className='container mx-auto flex items-center justify-between px-4'>
        <div className='flex items-center gap-6'>
          {/* Logo - Home Link */}
          <Link to='/' className='flex items-center gap-3 transition-opacity hover:opacity-80'>
            <img src='/logo.png' alt='MCX logo' className='size-8' />
            <h1 className='text-xl font-bold'>MCX Option Chain</h1>
          </Link>

          {/* Navigation Links */}
          <nav className='flex items-center gap-1'>
            {PAGE_CONFIGS.map((config) => {
              const isActive = location.pathname === config.path;
              return (
                <Link
                  key={config.id}
                  to={config.path}
                  className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <span className='mr-1.5'>{config.icon}</span>
                  {config.name}
                </Link>
              );
            })}
          </nav>
        </div>

        <div className='flex items-center gap-4'>
          {/* SD Multiplier Pill */}
          {sdData?.value !== undefined && (
            <Link
              to='/settings'
              className='bg-primary/10 text-primary hover:bg-primary/20 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium transition-colors'
            >
              <span className='text-primary/70'>SD</span>
              <span>{sdData.value}</span>
            </Link>
          )}

          {/* User Margin Pill */}
          {marginData?.net !== undefined && (
            <div
              className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium',
                marginData.net >= 0
                  ? 'bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400'
                  : 'bg-red-500/15 text-red-700 dark:bg-red-500/20 dark:text-red-400'
              )}
            >
              <span className='opacity-70'>Avl. Margin</span>
              <span>₹{formatMargin(marginData.net)}</span>
            </div>
          )}

          <UserButton isConnected={isConnected} />
        </div>
      </header>
    </div>
  );
}
