import { createClient } from '@/lib/supabase/server';

const AUTOMATION_CONFIG_KEY = 'automation_config';
const AUTOMATION_STATE_KEY = 'automation_state';
const AUTOMATION_OUTPUTS_KEY = 'automation_outputs';
const AUTOMATION_QUEUE_KEY = 'automation_queue';
const AUTOMATION_DEAD_LETTERS_KEY = 'automation_dead_letters';

export const automationPersistenceService = {
  async getConfig<T>(): Promise<T | null> {
    try {
      const supabase = await createClient();
      if (!supabase) return null;
      const { data } = (await (supabase as any)
        .from('system_configs')
        .select('value')
        .eq('key', AUTOMATION_CONFIG_KEY)
        .single()) as any;
      return data?.value as T | null;
    } catch (error) {
      console.error('[AutomationPersistence] Failed to get config:', error);
      return null;
    }
  },

  async saveConfig<T>(config: T): Promise<void> {
    try {
      const supabase = await createClient();
      if (!supabase) return;
      const { error } = await (supabase as any)
        .from('system_configs')
        .upsert({ key: AUTOMATION_CONFIG_KEY, value: config as any }) as any;
      if (error) {
        console.error('[AutomationPersistence] Failed to save config:', error);
      }
    } catch (error) {
      console.error('[AutomationPersistence] Failed to save config:', error);
    }
  },

  async getState<T>(): Promise<T | null> {
    try {
      const supabase = await createClient();
      if (!supabase) return null;
      const { data } = (await (supabase as any)
        .from('system_configs')
        .select('value')
        .eq('key', AUTOMATION_STATE_KEY)
        .single()) as any;
      return data?.value as T | null;
    } catch (error) {
      console.error('[AutomationPersistence] Failed to get state:', error);
      return null;
    }
  },

  async saveState<T>(state: T): Promise<void> {
    try {
      const supabase = await createClient();
      if (!supabase) return;
      const { error } = await (supabase as any)
        .from('system_configs')
        .upsert({ key: AUTOMATION_STATE_KEY, value: state as any }) as any;
      if (error) {
        console.error('[AutomationPersistence] Failed to save state:', error);
      }
    } catch (error) {
      console.error('[AutomationPersistence] Failed to save state:', error);
    }
  },

  async getOutputs<T>(): Promise<T[]> {
    try {
      const supabase = await createClient();
      if (!supabase) return [];
      const { data } = (await (supabase as any)
        .from('system_configs')
        .select('value')
        .eq('key', AUTOMATION_OUTPUTS_KEY)
        .single()) as any;
      const value = data?.value as T[] | undefined;
      return Array.isArray(value) ? value : [];
    } catch (error) {
      console.error('[AutomationPersistence] Failed to get outputs:', error);
      return [];
    }
  },

  async saveOutputs<T>(outputs: T[]): Promise<void> {
    try {
      const supabase = await createClient();
      if (!supabase) return;
      const { error } = await (supabase as any)
        .from('system_configs')
        .upsert({ key: AUTOMATION_OUTPUTS_KEY, value: outputs as any }) as any;
      if (error) {
        console.error('[AutomationPersistence] Failed to save outputs:', error);
      }
    } catch (error) {
      console.error('[AutomationPersistence] Failed to save outputs:', error);
    }
  },

  async getQueue<T>(): Promise<T[]> {
    try {
      const supabase = await createClient();
      if (!supabase) return [];
      const { data } = (await (supabase as any)
        .from('system_configs')
        .select('value')
        .eq('key', AUTOMATION_QUEUE_KEY)
        .single()) as any;
      const value = data?.value as T[] | undefined;
      return Array.isArray(value) ? value : [];
    } catch (error) {
      console.error('[AutomationPersistence] Failed to get queue:', error);
      return [];
    }
  },

  async saveQueue<T>(queue: T[]): Promise<void> {
    try {
      const supabase = await createClient();
      if (!supabase) return;
      const { error } = await (supabase as any)
        .from('system_configs')
        .upsert({ key: AUTOMATION_QUEUE_KEY, value: queue as any }) as any;
      if (error) {
        console.error('[AutomationPersistence] Failed to save queue:', error);
      }
    } catch (error) {
      console.error('[AutomationPersistence] Failed to save queue:', error);
    }
  },

  async getDeadLetters<T>(): Promise<T[]> {
    try {
      const supabase = await createClient();
      if (!supabase) return [];
      const { data } = (await (supabase as any)
        .from('system_configs')
        .select('value')
        .eq('key', AUTOMATION_DEAD_LETTERS_KEY)
        .single()) as any;
      const value = data?.value as T[] | undefined;
      return Array.isArray(value) ? value : [];
    } catch (error) {
      console.error('[AutomationPersistence] Failed to get dead letters:', error);
      return [];
    }
  },

  async saveDeadLetters<T>(deadLetters: T[]): Promise<void> {
    try {
      const supabase = await createClient();
      if (!supabase) return;
      const { error } = await (supabase as any)
        .from('system_configs')
        .upsert({ key: AUTOMATION_DEAD_LETTERS_KEY, value: deadLetters as any }) as any;
      if (error) {
        console.error('[AutomationPersistence] Failed to save dead letters:', error);
      }
    } catch (error) {
      console.error('[AutomationPersistence] Failed to save dead letters:', error);
    }
  },
};
