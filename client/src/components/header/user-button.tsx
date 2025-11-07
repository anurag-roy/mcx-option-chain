import { useTheme } from '@client/components/theme-provider';
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
import { api } from '@client/lib/api';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  AlertCircleIcon,
  Loader2Icon,
  LogOutIcon,
  MonitorIcon,
  MoonIcon,
  SettingsIcon,
  SunIcon,
  SunMoonIcon,
} from 'lucide-react';

export function UserButton() {
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

  const nameInitials = userProfile?.user_name.slice(0, 2).toUpperCase();

  const UserAvatar = () => (
    <Avatar className='h-8 w-8 rounded-full'>
      <Avatar className='h-8 w-8 rounded-full'>
        <AvatarFallback className='rounded-full text-sm'>{nameInitials}</AvatarFallback>
      </Avatar>
    </Avatar>
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className='rounded-full'>
        <UserAvatar />
      </DropdownMenuTrigger>
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
        <Link to='/settings'>
          <DropdownMenuItem className='gap-2'>
            <SettingsIcon className='text-muted-foreground h-4 w-4' />
            Settings
          </DropdownMenuItem>
        </Link>
        <Link to='/sign-out'>
          <DropdownMenuItem className='gap-2'>
            <LogOutIcon className='text-muted-foreground h-4 w-4' />
            Sign out
          </DropdownMenuItem>
        </Link>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
