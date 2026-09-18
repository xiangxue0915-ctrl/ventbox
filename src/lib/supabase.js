import { createClient } from '@supabase/supabase-js';

// 公共配置（publishable key 本就可放前端；权限靠 RLS 控制，不暴露个人隐私）
export const SUPABASE_URL = 'https://stsftvlkmppzkgjkwtjh.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_eCI-mXA5y0AHTWE_TzAI3w_MSwkTsMS';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: true,
});
