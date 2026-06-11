import { createClient } from "@supabase/supabase-js";

// 브라우저용 Supabase 클라이언트 (anon key).
// PRD: 정식 인증 없이 anon 키로 접근하고, 데이터 격리는 share_token 기반 RLS/RPC 로 통제한다.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Supabase 환경변수가 없습니다. .env.local 에 NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY 를 설정하세요.",
  );
}

// 세션 유지가 필요 없으므로(익명 사용) persistSession 비활성화.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false },
});
