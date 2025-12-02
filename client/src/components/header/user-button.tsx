import { Avatar, AvatarFallback } from '@client/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@client/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@client/components/ui/tooltip';
import { useTheme } from '@client/hooks/use-theme';
import { api } from '@client/lib/api';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  AlertCircleIcon,
  Loader2Icon,
  MonitorIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
  SunMoonIcon,
  XIcon,
} from 'lucide-react';

const getUserInitials = (name: string) => {
  const nameParts = name.split(' ').filter(Boolean);
  if (nameParts.length === 1) {
    return nameParts[0].slice(0, 2).toUpperCase();
  }
  return nameParts[0].slice(0, 1).toUpperCase() + nameParts[1].slice(0, 1).toUpperCase();
};

interface UserButtonProps {
  isConnected: boolean;
}

export function UserButton({ isConnected }: UserButtonProps) {
  const {
    data: userProfile,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['userProfile'],
    queryFn: async () => {
      const res = await api.user.$get();
      return res.json();
    },
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    gcTime: Number.POSITIVE_INFINITY,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const { theme, setTheme } = useTheme();

  if (isLoading) {
    return (
      <div className='w- rounded-full'>
        <Loader2Icon className='size-4 animate-spin' />
      </div>
    );
  }
  if (isError) {
    return (
      <Tooltip>
        <TooltipTrigger>
          <AlertCircleIcon className='size-4' />
        </TooltipTrigger>
        <TooltipContent>Error fetching user details</TooltipContent>
      </Tooltip>
    );
  }

  // const nameInitials = userProfile?.user_name.slice(0, 2).toUpperCase();
  const nameInitials = getUserInitials(userProfile?.user_name || 'User');

  const UserAvatar = ({ showStatus = false }: { showStatus?: boolean }) => (
    <div className='relative'>
      <Avatar className='h-8 w-8 rounded-full'>
        <AvatarFallback className='rounded-full text-sm'>{nameInitials}</AvatarFallback>
      </Avatar>
      {showStatus && (
        <>
          {isConnected ? (
            <span className='absolute -bottom-0.5 -left-0.5 flex h-3 w-3 items-center justify-center rounded-full border-2 border-background bg-emerald-500' />
          ) : (
            <span className='absolute -bottom-0.5 -left-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-background bg-red-500'>
              <XIcon className='h-2 w-2 text-white' strokeWidth={3} />
            </span>
          )}
        </>
      )}
    </div>
  );

  const avatarWithStatus = <UserAvatar showStatus />;

  return (
    <DropdownMenu>
      {isConnected ? (
        <DropdownMenuTrigger className='rounded-full'>{avatarWithStatus}</DropdownMenuTrigger>
      ) : (
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger className='rounded-full'>{avatarWithStatus}</DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>
            <p>Disconnected from server</p>
          </TooltipContent>
        </Tooltip>
      )}
      <DropdownMenuContent className='w-48 max-w-48 rounded-lg' side='bottom' align='end' sideOffset={4}>
        <DropdownMenuLabel className='p-0 font-normal'>
          <div className='flex items-center gap-2 px-1 py-1.5 text-left text-sm'>
            <UserAvatar />
            <div className='grid flex-1 text-left text-sm leading-tight'>
              <span className='truncate font-semibold'>{userProfile?.user_id}</span>
              <span className='truncate text-xs'>{userProfile?.user_name}</span>
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuSub>
          <DropdownMenuSubTrigger className='gap-2'>
            <SunMoonIcon className='text-muted-foreground h-4 w-4' />
            Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuPortal>
            <DropdownMenuSubContent>
              <DropdownMenuCheckboxItem
                className='gap-2'
                checked={theme === 'light'}
                onCheckedChange={() => setTheme('light')}
              >
                <SunIcon className='text-muted-foreground h-4 w-4' />
                Light
              </DropdownMenuCheckboxItem>
              <DropdownMenuCheckboxItem
                className='gap-2'
                checked={theme === 'dark'}
                onCheckedChange={() => setTheme('dark')}
              >
                <MoonIcon className='text-muted-foreground h-4 w-4' />
                Dark
              </DropdownMenuCheckboxItem>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                className='gap-2'
                checked={theme === 'system'}
                onCheckedChange={() => setTheme('system')}
              >
                <MonitorIcon className='text-muted-foreground h-4 w-4' />
                System
              </DropdownMenuCheckboxItem>
            </DropdownMenuSubContent>
          </DropdownMenuPortal>
        </DropdownMenuSub>
        <DropdownMenuItem asChild className='gap-2'>
          <Link to='/settings'>
            <SettingsIcon className='text-muted-foreground h-4 w-4' />
            Settings
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
