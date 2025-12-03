import { cn } from '@client/lib/utils';
import { MinusIcon, PlusIcon } from 'lucide-react';
import { Button, Group, Input, NumberField, type NumberFieldProps } from 'react-aria-components';

interface NumberInputProps extends Omit<NumberFieldProps, 'children'> {
  className?: string;
  inputClassName?: string;
}

export function NumberInput({ className, inputClassName, ...props }: NumberInputProps) {
  return (
    <NumberField {...props}>
      <Group
        className={cn(
          'border-input data-focus-within:border-ring data-focus-within:ring-ring/50 relative inline-flex h-9 w-full items-center overflow-hidden rounded-md border text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none data-disabled:opacity-50 data-focus-within:ring-[3px]',
          className
        )}
      >
        <Button
          className='border-input bg-background text-muted-foreground/80 hover:bg-accent hover:text-foreground -ms-px flex aspect-square h-[inherit] items-center justify-center rounded-s-md border text-sm transition-[color,box-shadow] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50'
          slot='decrement'
        >
          <MinusIcon aria-hidden='true' size={16} />
        </Button>
        <Input
          className={cn('bg-background text-foreground w-full grow px-3 py-2 text-center tabular-nums', inputClassName)}
        />
        <Button
          className='border-input bg-background text-muted-foreground/80 hover:bg-accent hover:text-foreground -me-px flex aspect-square h-[inherit] items-center justify-center rounded-e-md border text-sm transition-[color,box-shadow] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50'
          slot='increment'
        >
          <PlusIcon aria-hidden='true' size={16} />
        </Button>
      </Group>
    </NumberField>
  );
}
