---
name: supabase-realtime-patterns
description: Supabase Realtime best practices for postgres_changes subscriptions, channel lifecycle management in React, reconnect resilience, and atomic state sync for high-concurrency queues and emergency broadcasts.
---

# Supabase Realtime Patterns & Best Practices

Guidance for implementing high-throughput, race-condition-free real-time subscriptions in React + Supabase.

## When to Activate
- Setting up real-time queue position trackers
- Building emergency dispatch hospital broadcast channels
- Implementing optimistic UI updates with server confirmation
- Handling WebSocket connection drops, reconnections, and memory leak cleanups in React `useEffect`

## 1. Safe Channel Lifecycle in React

Always clean up channels on unmount to prevent duplicated listeners and socket memory leaks.

```tsx
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';

export function useQueueSubscription(clinicId: string) {
  const [queue, setQueue] = useState<QueueItem[]>([]);

  useEffect(() => {
    let channel: RealtimeChannel | null = null;

    // Initial fetch from Single Source of Truth (PostgreSQL)
    const fetchInitial = async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('clinic_id', clinicId)
        .order('slot_time', { ascending: true });

      if (!error && data) setQueue(data);
    };

    fetchInitial();

    // Subscribe to postgres_changes with strict row filter
    channel = supabase
      .channel(`queue:${clinicId}`)
      .on(
        'postgres_changes',
        {
          event: '*', // INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'appointments',
          filter: `clinic_id=eq.${clinicId}`,
        },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            setQueue((prev) => [...prev, payload.new as QueueItem]);
          } else if (payload.eventType === 'UPDATE') {
            setQueue((prev) =>
              prev.map((item) => (item.id === payload.new.id ? (payload.new as QueueItem) : item))
            );
          } else if (payload.eventType === 'DELETE') {
            setQueue((prev) => prev.filter((item) => item.id === payload.old.id));
          }
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Connected to queue:${clinicId}`);
        }
        if (status === 'CHANNEL_ERROR') {
          console.error('Realtime channel error:', err);
        }
      });

    return () => {
      if (channel) {
        supabase.removeChannel(channel);
      }
    };
  }, [clinicId]);

  return { queue };
}
```

## 2. Emergency Broadcast Channel (Low Latency)

For instantaneous emergency broadcast across nearby hospitals, use Supabase Broadcast alongside DB persistence:

```tsx
// Hospital Dispatcher Broadcast
export async function broadcastEmergencyAlert(emergencyPayload: EmergencyRequest) {
  // 1. Write to DB via Atomic RPC
  const { data, error } = await supabase.rpc('create_emergency_request', emergencyPayload);
  if (error) throw error;

  // 2. Broadcast to active radar channel
  const channel = supabase.channel('emergency-radar');
  await channel.send({
    type: 'broadcast',
    event: 'NEW_EMERGENCY',
    payload: data,
  });
}
```

## 3. Core Safety Rules
1. **Never mutate local state without DB verification**: Always let PostgreSQL generate tokens, lock slots, or allocate emergency resources via atomic SQL functions (`SELECT ... FOR UPDATE`).
2. **Handle Reconnection**: Trigger a refetch on `SUBSCRIBED` status if reconnecting after an offline period.
3. **Filter at Database Level**: Always specify `filter: "id=eq.X"` or `filter: "clinic_id=eq.Y"` to prevent client-side broadcast overload.
