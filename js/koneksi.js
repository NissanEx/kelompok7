// ============================================================
//  Blog Minimalis — koneksi.js
//  Konfigurasi & inisialisasi Supabase
//  Ganti SUPABASE_URL dan SUPABASE_ANON_KEY dengan milik Anda
// ============================================================

const SUPABASE_URL     = "https://ryljgklbnqdglirmvmzk.supabase.co";   // Contoh: "https://xyzabcde.supabase.co"
const SUPABASE_ANON_KEY = "sb_publishable_yNPzZbvozHXAvPUG2ESFaA_jSHiw1wU";  // Contoh: "eyJhbGciOiJIUzI1NiIsInR5cCI6..."

let supabaseClient   = null;
let isSupabaseActive = false;

if (SUPABASE_URL && SUPABASE_ANON_KEY) {
    try {
        supabaseClient   = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        isSupabaseActive = true;
        console.log("✅ Supabase berhasil terhubung!");
    } catch (err) {
        console.error("❌ Gagal menginisialisasi Supabase Client:", err);
    }
} else {
    console.warn("⚠️  Supabase URL atau Key kosong. Menggunakan penyimpanan lokal bawaan.");
}