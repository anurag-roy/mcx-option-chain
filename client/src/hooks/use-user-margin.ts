import { api } from '@client/lib/api';
import { useQuery } from '@tanstack/react-query';

export function useUserMargin() {
  return useQuery({
    queryKey: ['userMargin'],
    queryFn: async () => {
      const res = await api.user.margin.$get();
      return res.json();
    },
    refetchInterval: 5000,
  });
}
