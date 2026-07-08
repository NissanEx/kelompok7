// ============================================================
//  Blog Minimalis — main.js (REVISI v2)
//  Fix: RLS DELETE, ensure user_id always set on insert, better logging
// ============================================================

/* ---- State Global ---- */
let activeBlogs       = [];
let currentUser       = null;   // email user yang login
let currentUserUid    = null;   // UUID dari Supabase Auth
let profileBioText    = "Saya menyukai keindahan kata-kata dan visual minimalis.";
let profileAvatarData = "";
let editingPostId     = null;   // null = mode tambah baru, isi = mode edit
let selectedImageBase64 = null; // gambar sampul yang dipilih di modal tulis

/* ================================================================
   FUNGSI: Cek koneksi Supabase dengan timeout
   ================================================================ */
async function waitForSupabase(timeout = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (typeof isSupabaseActive !== 'undefined' && isSupabaseActive) {
            return true;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    return false;
}

/* ================================================================
   FUNGSI: Cek apakah user adalah pemilik artikel
   ================================================================ */
function isArticleOwner(blog) {
    if (!currentUser || !currentUserUid) return false;

    // RLS check: user_id harus cocok dengan auth.uid()
    return blog.user_id === currentUserUid;
}

/* ================================================================
   INISIALISASI — Dipanggil saat halaman home selesai dimuat
   ================================================================ */
window.onload = async function () {
    const pageLoader   = document.getElementById('page-loader');
    const loaderText   = document.getElementById('loader-text');
    const menuBar      = document.getElementById('menu-bar');
    const menuContent  = document.getElementById('menu-content');

    // Cek session login
    const savedUser = sessionStorage.getItem('blogUser');
    const savedUid  = sessionStorage.getItem('blogUid');
    if (savedUser && savedUid) {
        currentUser    = savedUser;
        currentUserUid = savedUid;
        console.log('✅ User ditemukan di session:', currentUser, 'UID:', currentUserUid);
    }

    // Tunggu Supabase siap
    const supabaseReady = await waitForSupabase();

    if (!supabaseReady || !isSupabaseActive) {
        if (loaderText) loaderText.innerText = "Koneksi database gagal";
        tampilkanNotifikasi("Database tidak tersedia. Silakan refresh halaman.", "#4a0e0e", "red");

        const blogContainer = document.getElementById('blog-container');
        if (blogContainer) {
            blogContainer.innerHTML = `
                <div class="col-span-full text-center py-20">
                    <p class="text-xl font-serif italic text-white/70">⚠️ Gagal terhubung ke database</p>
                    <p class="text-sm text-white/40 mt-2">Periksa koneksi internet dan refresh halaman</p>
                </div>`;
        }

        setTimeout(() => {
            if (pageLoader) pageLoader.classList.add('opacity-0', 'pointer-events-none');
        }, 500);
        return;
    }

    if (loaderText) loaderText.innerText = "Memuat data dari Supabase...";

    await muatDataBlogs();

    // 1. Splash screen memudar (500ms)
    setTimeout(() => {
        if (pageLoader) pageLoader.classList.add('opacity-0', 'pointer-events-none');
        tampilkanNotifikasi("Terhubung dengan database Supabase", "#0e4a2e", "green");
    }, 500);

    // 2. Pill muncul dari atas (700ms)
    setTimeout(() => {
        if (menuBar) {
            menuBar.classList.remove('opacity-0', '-translate-y-6');
            menuBar.classList.add('opacity-100', 'translate-y-0');
        }
    }, 700);

    // 3. Pill melebar jadi navbar penuh (1050ms)
    setTimeout(() => {
        if (menuBar) {
            menuBar.classList.remove('w-10', 'rounded-full');
            menuBar.classList.add('w-full', 'rounded-2xl');
        }
    }, 1050);

    // 4. Konten fade in (1800ms)
    setTimeout(() => {
        if (menuContent) {
            menuContent.classList.remove('opacity-0', 'pointer-events-none');
            menuContent.classList.add('opacity-100', 'pointer-events-auto');
        }
    }, 1800);

    updateUserUI();

    if (currentUserUid) {
        await sinkronkanProfilSupabase();
    }

    pasangEventListeners();
};

/* ================================================================
   FUNGSI: Update UI berdasarkan status login
   ================================================================ */
function updateUserUI() {
    const masukBtn  = document.getElementById('masuk-btn');
    const profilBtn = document.getElementById('profil-btn');

    if (currentUser) {
        const username = currentUser.includes('@') ? currentUser.split('@')[0] : currentUser;
        if (masukBtn) masukBtn.innerText = `Keluar (${username})`;
        if (profilBtn) profilBtn.classList.remove('hidden');
        console.log('👤 User login:', currentUser, 'UID:', currentUserUid);
    } else {
        if (masukBtn) masukBtn.innerText = "Masuk";
        if (profilBtn) profilBtn.classList.add('hidden');
        console.log('👤 Tidak ada user login');
    }
}

/* ================================================================
   FUNGSI: Muat Data Blog dari Supabase
   ================================================================ */
async function muatDataBlogs() {
    if (!isSupabaseActive) {
        console.warn("⚠️ Supabase tidak aktif");
        activeBlogs = [];
        renderBlog();
        return;
    }

    try {
        const { data, error } = await supabaseClient
            .from('posts')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;
        activeBlogs = data || [];
        console.log(`✅ Memuat ${activeBlogs.length} artikel dari Supabase`);

        activeBlogs.forEach(blog => {
            console.log(`📝 "${blog.judul}" | author: ${blog.author} | user_id: ${blog.user_id}`);
        });

        updateStatistikProfil();

    } catch (err) {
        console.error("❌ Gagal mengambil data dari Supabase:", err);
        tampilkanNotifikasi("Gagal memuat data dari database", "#4a0e0e", "red");
        activeBlogs = [];
    }
    renderBlog();
}

function updateStatistikProfil() {
    const profileStatPosts = document.getElementById('profile-stat-posts');
    if (!profileStatPosts || !currentUser || !currentUserUid) return;
    const jumlah = activeBlogs.filter(b => isArticleOwner(b)).length;
    profileStatPosts.innerText = jumlah;
}

/* ================================================================
   FUNGSI: Render Kartu Blog (Zig-zag Layout)
   ================================================================ */
function renderBlog(filterQuery = '') {
    const blogContainer = document.getElementById('blog-container');
    if (!blogContainer) return;

    blogContainer.innerHTML = '';

    if (!isSupabaseActive) {
        blogContainer.innerHTML = `
            <div class="col-span-full text-center py-20">
                <p class="text-xl font-serif italic text-white/70">⚠️ Database tidak tersedia</p>
                <p class="text-sm text-white/40 mt-2">Periksa koneksi internet dan refresh halaman</p>
            </div>`;
        return;
    }

    const filteredBlog = activeBlogs.filter(blog =>
        `${blog.judul} ${blog.author} ${blog.deskripsi}`
            .toLowerCase()
            .includes(filterQuery.toLowerCase().trim())
    );

    if (filteredBlog.length === 0) {
        blogContainer.innerHTML = `
            <div class="col-span-full text-center py-12 opacity-75">
                <p class="text-xl font-serif italic text-white/70">${filterQuery ? 'Tidak ada konten yang cocok ditemukan...' : '✨ Belum ada artikel. Jadilah yang pertama menulis!'}</p>
            </div>`;
        return;
    }

    filteredBlog.forEach((blog, index) => {
        const isThird   = (index % 3 === 2);
        const gridClass = isThird ? "md:col-span-2 md:justify-self-center md:mt-6" : "";

        const isOwner = isArticleOwner(blog);

        console.log(`🔍 "${blog.judul}" | isOwner: ${isOwner} | blog.user_id: ${blog.user_id} | currentUid: ${currentUserUid}`);

        blogContainer.insertAdjacentHTML('beforeend', `
            <div class="blog-card flex flex-row items-center gap-3 sm:gap-5 w-full max-w-md hover-effect ${gridClass} text-white relative">
                <img src="${blog.image}" alt="Ilustrasi ${blog.judul}"
                     class="w-20 h-20 sm:w-28 sm:h-28 md:w-36 md:h-36 rounded-[14px] sm:rounded-[20px] md:rounded-[24px] object-cover shadow-xl shrink-0"
                     onerror="this.src='https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=400&auto=format&fit=crop'">
                <div class="card-info flex flex-col justify-between h-20 sm:h-28 md:h-36 py-0.5 flex-grow">
                    <div>
                        <h2 class="text-lg sm:text-2xl md:text-3xl font-bold leading-tight text-white font-serif line-clamp-2">${blog.judul}</h2>
                        <p class="card-author font-bold text-[9px] sm:text-[10px] md:text-xs text-white/70 mt-0.5">Oleh ${blog.author}</p>
                        <p class="card-desc text-[9px] sm:text-[10px] md:text-xs text-white/55 mt-1 leading-relaxed line-clamp-1 sm:line-clamp-2">${blog.deskripsi}</p>
                    </div>
                    <div class="flex items-center gap-2 flex-wrap">
                        <button onclick="bukaArtikel(${blog.id})"
                                class="btn-baca self-start ${blog.color || 'bg-[#4a0e0e] hover:bg-[#5f1414]'} text-white px-3 py-1 sm:px-5 sm:py-1.5 md:px-6 rounded-full text-[9px] sm:text-[10px] md:text-xs font-semibold shadow-md transition-all duration-200 transform active:scale-95">
                            Baca
                        </button>
                        ${isOwner ? `
                            <button onclick="editArtikel(${blog.id})"
                                    class="btn-edit text-xs text-white/60 hover:text-white transition-colors">
                                ✎ Edit
                            </button>
                            <button onclick="hapusArtikel(${blog.id})"
                                    class="btn-hapus text-xs text-red-400/60 hover:text-red-400 transition-colors">
                                ✕ Hapus
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `);
    });
}

/* ================================================================
   FUNGSI: Reset Form Modal Tulis (kembali ke mode tambah baru)
   ================================================================ */
function resetFormTulis() {
    editingPostId = null;
    selectedImageBase64 = null;

    const inputJudul   = document.getElementById('input-judul');
    const inputKonten  = document.getElementById('input-konten');
    const previewGambar = document.getElementById('preview-gambar');
    const placeholderContainer = document.getElementById('placeholder-container');
    const uploadBtn = document.getElementById('upload-btn');
    const fileInput = document.getElementById('file-input');

    if (inputJudul) inputJudul.value = '';
    if (inputKonten) inputKonten.value = '';
    if (fileInput) fileInput.value = '';
    if (previewGambar) {
        previewGambar.src = '';
        previewGambar.classList.add('hidden');
    }
    if (placeholderContainer) placeholderContainer.classList.remove('hidden');
    if (uploadBtn) uploadBtn.innerText = 'Upload Cerita';
}

/* ================================================================
   FUNGSI: Edit Artikel
   ================================================================ */
function editArtikel(id) {
    console.log('✏️ Edit artikel ID:', id);

    const blog = activeBlogs.find(b => b.id === id);
    if (!blog) {
        tampilkanNotifikasi("Artikel tidak ditemukan", "#4a0e0e", "red");
        return;
    }

    if (!isArticleOwner(blog)) {
        tampilkanNotifikasi("Anda tidak memiliki izin untuk mengedit artikel ini", "#4a0e0e", "red");
        console.warn('❌ Bukan pemilik. Current UID:', currentUserUid, 'Blog UID:', blog.user_id);
        return;
    }

    // Set state editing
    editingPostId = id;
    selectedImageBase64 = null;
    console.log('✅ Edit mode aktif untuk ID:', editingPostId);

    const inputJudul = document.getElementById('input-judul');
    const inputKonten = document.getElementById('input-konten');
    const previewGambar = document.getElementById('preview-gambar');
    const placeholderContainer = document.getElementById('placeholder-container');
    const uploadBtn = document.getElementById('upload-btn');

    if (inputJudul) inputJudul.value = blog.judul;
    if (inputKonten) inputKonten.value = blog.konten;
    if (previewGambar) {
        previewGambar.src = blog.image;
        previewGambar.classList.remove('hidden');
    }
    if (placeholderContainer) placeholderContainer.classList.add('hidden');
    if (uploadBtn) uploadBtn.innerText = "Update Cerita";

    const modalTulis = document.getElementById('modal-tulis');
    const modalCard  = document.getElementById('modal-card');

    if (modalTulis) {
        modalTulis.classList.remove('opacity-0', 'pointer-events-none');
        modalTulis.classList.add('opacity-100', 'pointer-events-auto');
        setTimeout(() => modalCard && modalCard.classList.remove('scale-95'), 50);
    }
}

/* ================================================================
   FUNGSI: Hapus Artikel
   ================================================================ */
async function hapusArtikel(id) {
    console.log('🗑️ Hapus artikel ID:', id);

    const blog = activeBlogs.find(b => b.id === id);
    if (!blog) {
        tampilkanNotifikasi("Artikel tidak ditemukan", "#4a0e0e", "red");
        return;
    }

    // ✅ OWNERSHIP CHECK — Gunakan isArticleOwner yang sudah di-fix
    if (!isArticleOwner(blog)) {
        tampilkanNotifikasi("Anda tidak memiliki izin untuk menghapus artikel ini", "#4a0e0e", "red");
        console.warn('❌ Bukan pemilik. Current UID:', currentUserUid, 'Blog UID:', blog.user_id);
        return;
    }

    if (!confirm(`Apakah Anda yakin ingin menghapus artikel "${blog.judul}"?`)) {
        console.log('❌ Batal hapus');
        return;
    }

    if (!isSupabaseActive) {
        tampilkanNotifikasi("Database tidak tersedia", "#4a0e0e", "red");
        return;
    }

    try {
        console.log('🚀 Menghapus artikel ID:', id, 'user_id:', blog.user_id);

        const { error, count } = await supabaseClient
            .from('posts')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('❌ Error dari Supabase:', error.message);
            throw error;
        }

        console.log('✅ Delete response - count:', count);

        // RLS policy hanya izinkan jika auth.uid() = user_id
        // Jika count = 0, berarti RLS menolak DELETE (uid tidak match)
        if (count === 0) {
            console.warn('⚠️ RLS policy DELETE menolak operasi');
            tampilkanNotifikasi("Penghapusan ditolak: Anda bukan pemilik artikel atau RLS policy issue", "#4a0e0e", "red");
            return;
        }

        console.log('✅ Artikel berhasil dihapus dari database');
        tampilkanNotifikasi(`Artikel "${blog.judul}" berhasil dihapus`, "#0e4a2e", "green");

        await muatDataBlogs();

    } catch (err) {
        console.error("❌ Gagal menghapus artikel:", err.message, err);
        tampilkanNotifikasi("Gagal menghapus: " + err.message, "#4a0e0e", "red");
    }
}

/* ================================================================
   FUNGSI: Buka Modal Baca Artikel
   ================================================================ */
function bukaArtikel(id) {
    const blog = activeBlogs.find(b => b.id === id);
    if (!blog) return;

    document.getElementById('baca-gambar').src       = blog.image;
    document.getElementById('baca-author').innerText = `Oleh ${blog.author}`;
    document.getElementById('baca-judul').innerText  = blog.judul;
    document.getElementById('baca-konten').innerText = blog.konten;

    const modalBaca     = document.getElementById('modal-baca');
    const modalBacaCard = document.getElementById('modal-baca-card');

    if (!modalBaca || !modalBacaCard) return;

    modalBaca.classList.remove('opacity-0', 'pointer-events-none');
    modalBaca.classList.add('opacity-100', 'pointer-events-auto');
    setTimeout(() => modalBacaCard.classList.remove('scale-95', 'translate-y-4'), 50);
}

/* ================================================================
   FUNGSI: Sinkronkan Profil dari Supabase
   ================================================================ */
async function sinkronkanProfilSupabase() {
    if (!isSupabaseActive || !currentUserUid) return;

    try {
        let { data: profile, error } = await supabaseClient
            .from('profiles')
            .select('*')
            .eq('id', currentUserUid)
            .single();

        if (error && error.code !== 'PGRST116') throw error;

        if (profile) {
            profileBioText    = profile.bio        || profileBioText;
            profileAvatarData = profile.avatar_url || profileAvatarData;

            const profileBio = document.getElementById('profile-bio');
            if (profileBio) profileBio.value = profileBioText;

            if (profileAvatarData) {
                const previewAvatar         = document.getElementById('preview-avatar');
                const avatarPlaceholderTeks = document.getElementById('avatar-placeholder-teks');
                if (previewAvatar) {
                    previewAvatar.src = profileAvatarData;
                    previewAvatar.classList.remove('hidden');
                }
                if (avatarPlaceholderTeks) avatarPlaceholderTeks.classList.add('hidden');
            }
        } else {
            await supabaseClient.from('profiles').insert([{
                id:       currentUserUid,
                username: currentUser.split('@')[0],
                bio:      profileBioText
            }]);
        }
    } catch (err) {
        console.error("❌ Gagal memuat profil Supabase:", err);
        tampilkanNotifikasi("Gagal memuat profil", "#4a0e0e", "red");
    }
}

/* ================================================================
   FUNGSI: Toast Notifikasi Elegan
   ================================================================ */
function tampilkanNotifikasi(pesan, bg, color) {
    const borderHex = color === 'red'
        ? 'border-red-500/50'
        : (color === 'green' ? 'border-green-500/50' : 'border-white/20');

    const n = document.createElement('div');
    n.className = `fixed top-24 left-1/2 transform -translate-x-1/2 ${borderHex} text-white px-6 py-3 rounded-xl shadow-2xl z-[999] text-sm border font-serif backdrop-blur-md transition-all duration-300`;
    n.style.backgroundColor = bg + "dd";
    n.innerText = pesan;
    document.body.appendChild(n);

    setTimeout(() => {
        n.classList.add('opacity-0', '-translate-y-2');
        setTimeout(() => n.remove(), 300);
    }, 2800);
}

/* ================================================================
   FUNGSI: Logout
   ================================================================ */
async function logout() {
    try {
        if (isSupabaseActive) {
            await supabaseClient.auth.signOut();
        }
    } catch (err) {
        console.error("❌ Gagal sign out:", err);
    }
    sessionStorage.removeItem('blogUser');
    sessionStorage.removeItem('blogUid');
    currentUser = null;
    currentUserUid = null;
    updateUserUI();
    renderBlog(document.getElementById('search-input')?.value || '');
    tampilkanNotifikasi("Anda telah keluar", "#1c1c1c", "white");
}

/* ================================================================
   FUNGSI: Pasang Semua Event Listener
   ================================================================ */
function pasangEventListeners() {

    /* ---- Referensi Elemen DOM ---- */
    const menuBar      = document.getElementById('menu-bar');
    const menuContent  = document.getElementById('menu-content');
    const extraMenu    = document.getElementById('extra-menu');
    const searchInput  = document.getElementById('search-input');
    const homeBtn      = document.getElementById('home-btn');
    const masukBtn     = document.getElementById('masuk-btn');
    const profilBtn    = document.getElementById('profil-btn');
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    const hamTop       = document.getElementById('ham-top');
    const hamBottom    = document.getElementById('ham-bottom');

    // Modal Masuk
    const modalMasuk     = document.getElementById('modal-masuk');
    const modalMasukCard = document.getElementById('modal-masuk-card');
    const tutupMasuk      = document.getElementById('tutup-masuk');
    const mulaiBtn        = document.getElementById('mulai-btn');
    const tabMasuk        = document.getElementById('tab-masuk');
    const tabDaftar       = document.getElementById('tab-daftar');
    const loginUsername   = document.getElementById('login-username');
    const loginPassword   = document.getElementById('login-password');
    const loginConfirmPassword = document.getElementById('login-confirm-password');

    // Modal Profil
    const modalProfil     = document.getElementById('modal-profil');
    const modalProfilCard = document.getElementById('modal-profil-card');
    const tutupProfil      = document.getElementById('tutup-profil');
    const simpanProfilBtn  = document.getElementById('simpan-profil-btn');
    const pilihAvatarTrigger = document.getElementById('pilih-avatar-trigger');
    const avatarInput      = document.getElementById('avatar-input');
    const previewAvatar    = document.getElementById('preview-avatar');
    const avatarPlaceholderTeks = document.getElementById('avatar-placeholder-teks');
    const profileDisplayName = document.getElementById('profile-display-name');
    const profileBio        = document.getElementById('profile-bio');

    // Modal Tulis
    const tulisBtn      = document.getElementById('tulis-btn');
    const modalTulis     = document.getElementById('modal-tulis');
    const modalCard      = document.getElementById('modal-card');
    const tutupModal      = document.getElementById('tutup-modal');
    const inputJudul       = document.getElementById('input-judul');
    const inputKonten      = document.getElementById('input-konten');
    const fileInput        = document.getElementById('file-input');
    const previewGambar    = document.getElementById('preview-gambar');
    const pilihGambarTrigger = document.getElementById('pilih-gambar-trigger');
    const placeholderContainer = document.getElementById('placeholder-container');
    const uploadBtn         = document.getElementById('upload-btn');

    // Modal Baca
    const modalBaca     = document.getElementById('modal-baca');
    const modalBacaCard = document.getElementById('modal-baca-card');
    const tutupBaca      = document.getElementById('tutup-baca');

    /* ----------------------------------------------------------
       NAVBAR: Search
       ---------------------------------------------------------- */
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderBlog(e.target.value);
        });
    }

    if (homeBtn) {
        homeBtn.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            renderBlog();
        });
    }

    /* ----------------------------------------------------------
       NAVBAR: Hamburger dropdown
       ---------------------------------------------------------- */
    let menuTerbuka = false;
    if (menuToggleBtn && extraMenu) {
        menuToggleBtn.addEventListener('click', () => {
            menuTerbuka = !menuTerbuka;
            if (menuTerbuka) {
                extraMenu.style.maxHeight = extraMenu.scrollHeight + 'px';
                extraMenu.classList.remove('opacity-0');
                extraMenu.classList.add('opacity-100');
                if (hamTop) hamTop.style.transform = 'rotate(45deg) translateY(2.5px)';
                if (hamBottom) hamBottom.style.transform = 'rotate(-45deg) translateY(-2.5px)';
            } else {
                extraMenu.style.maxHeight = '0px';
                extraMenu.classList.remove('opacity-100');
                extraMenu.classList.add('opacity-0');
                if (hamTop) hamTop.style.transform = '';
                if (hamBottom) hamBottom.style.transform = '';
            }
        });
    }

    /* ----------------------------------------------------------
       MODAL MASUK: buka / tutup / tab / submit
       ---------------------------------------------------------- */
    function bukaModalMasuk() {
        if (!modalMasuk) return;
        modalMasuk.classList.remove('opacity-0', 'pointer-events-none');
        modalMasuk.classList.add('opacity-100', 'pointer-events-auto');
        setTimeout(() => modalMasukCard && modalMasukCard.classList.remove('scale-95'), 50);
    }
    function tutupModalMasuk() {
        if (!modalMasuk) return;
        modalMasuk.classList.add('opacity-0', 'pointer-events-none');
        modalMasuk.classList.remove('opacity-100', 'pointer-events-auto');
        if (modalMasukCard) modalMasukCard.classList.add('scale-95');
    }

    if (masukBtn) {
        masukBtn.addEventListener('click', () => {
            if (currentUser) {
                logout();
            } else {
                bukaModalMasuk();
            }
        });
    }

    if (tutupMasuk) tutupMasuk.addEventListener('click', tutupModalMasuk);

    let currentTab = 'masuk';
    if (tabMasuk && tabDaftar) {
        tabMasuk.addEventListener('click', () => {
            currentTab = 'masuk';
            tabMasuk.classList.add('border-white', 'text-white');
            tabMasuk.classList.remove('border-transparent', 'text-white/40');
            tabDaftar.classList.add('border-transparent', 'text-white/40');
            tabDaftar.classList.remove('border-white', 'text-white');
            if (loginConfirmPassword) loginConfirmPassword.classList.add('hidden');
            if (mulaiBtn) mulaiBtn.innerText = "Mulai";
        });
        tabDaftar.addEventListener('click', () => {
            currentTab = 'daftar';
            tabDaftar.classList.add('border-white', 'text-white');
            tabDaftar.classList.remove('border-transparent', 'text-white/40');
            tabMasuk.classList.add('border-transparent', 'text-white/40');
            tabMasuk.classList.remove('border-white', 'text-white');
            if (loginConfirmPassword) loginConfirmPassword.classList.remove('hidden');
            if (mulaiBtn) mulaiBtn.innerText = "Daftar Sekarang";
        });
    }

    if (mulaiBtn) {
        mulaiBtn.addEventListener('click', async () => {
            const email    = loginUsername ? loginUsername.value.trim() : '';
            const password = loginPassword ? loginPassword.value : '';

            if (!email || !password) {
                tampilkanNotifikasi("Mohon isi semua data!", "#4a0e0e", "red");
                return;
            }

            if (!isSupabaseActive) {
                tampilkanNotifikasi("Database tidak tersedia", "#4a0e0e", "red");
                return;
            }

            if (currentTab === 'daftar') {
                const confirmPassword = loginConfirmPassword ? loginConfirmPassword.value : '';
                if (password !== confirmPassword) {
                    tampilkanNotifikasi("Kedua kata sandi tidak cocok!", "#4a0e0e", "red");
                    return;
                }
                try {
                    const { error } = await supabaseClient.auth.signUp({ email, password });
                    if (error) throw error;
                    tampilkanNotifikasi("Pendaftaran berhasil! Cek email verifikasi Anda.", "#0e4a2e", "green");
                    tabMasuk.click();
                } catch (err) {
                    tampilkanNotifikasi(err.message, "#4a0e0e", "red");
                }
                return;
            }

            // Mode masuk
            try {
                const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
                if (error) throw error;

                currentUser    = data.user.email;
                currentUserUid = data.user.id;
                sessionStorage.setItem('blogUser', currentUser);
                sessionStorage.setItem('blogUid', currentUserUid);

                console.log('✅ Login sukses - UID:', currentUserUid);

                tutupModalMasuk();
                updateUserUI();
                await sinkronkanProfilSupabase();
                renderBlog(searchInput ? searchInput.value : '');
                tampilkanNotifikasi(`Selamat datang, ${currentUser.split('@')[0]}!`, "#0e4a2e", "green");
            } catch (err) {
                tampilkanNotifikasi(err.message, "#4a0e0e", "red");
            }
        });
    }

    /* ----------------------------------------------------------
       MODAL PROFIL: buka / tutup / avatar / simpan
       ---------------------------------------------------------- */
    function bukaModalProfil() {
        if (!modalProfil) return;
        if (profileDisplayName) profileDisplayName.value = currentUser || '';
        if (profileBio) profileBio.value = profileBioText;
        updateStatistikProfil();
        modalProfil.classList.remove('opacity-0', 'pointer-events-none');
        modalProfil.classList.add('opacity-100', 'pointer-events-auto');
        setTimeout(() => modalProfilCard && modalProfilCard.classList.remove('scale-95'), 50);
    }
    function tutupModalProfil() {
        if (!modalProfil) return;
        modalProfil.classList.add('opacity-0', 'pointer-events-none');
        modalProfil.classList.remove('opacity-100', 'pointer-events-auto');
        if (modalProfilCard) modalProfilCard.classList.add('scale-95');
    }

    if (profilBtn) profilBtn.addEventListener('click', bukaModalProfil);
    if (tutupProfil) tutupProfil.addEventListener('click', tutupModalProfil);

    if (pilihAvatarTrigger && avatarInput) {
        pilihAvatarTrigger.addEventListener('click', () => avatarInput.click());
        avatarInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                profileAvatarData = ev.target.result;
                if (previewAvatar) {
                    previewAvatar.src = profileAvatarData;
                    previewAvatar.classList.remove('hidden');
                }
                if (avatarPlaceholderTeks) avatarPlaceholderTeks.classList.add('hidden');
            };
            reader.readAsDataURL(file);
        });
    }

    if (simpanProfilBtn) {
        simpanProfilBtn.addEventListener('click', async () => {
            if (!currentUserUid) {
                tampilkanNotifikasi("Silakan masuk terlebih dahulu", "#4a0e0e", "red");
                return;
            }
            profileBioText = profileBio ? profileBio.value : profileBioText;

            try {
                const { error } = await supabaseClient
                    .from('profiles')
                    .upsert([{
                        id:         currentUserUid,
                        username:   currentUser.split('@')[0],
                        bio:        profileBioText,
                        avatar_url: profileAvatarData
                    }]);
                if (error) throw error;
                tampilkanNotifikasi("Profil berhasil diperbarui", "#0e4a2e", "green");
                tutupModalProfil();
            } catch (err) {
                console.error("❌ Gagal menyimpan profil:", err);
                tampilkanNotifikasi("Gagal menyimpan profil: " + err.message, "#4a0e0e", "red");
            }
        });
    }

    /* ----------------------------------------------------------
       MODAL TULIS: buka / tutup / pilih gambar / submit (INSERT atau UPDATE)
       ---------------------------------------------------------- */
    function bukaModalTulis() {
        if (!modalTulis) return;
        modalTulis.classList.remove('opacity-0', 'pointer-events-none');
        modalTulis.classList.add('opacity-100', 'pointer-events-auto');
        setTimeout(() => modalCard && modalCard.classList.remove('scale-95'), 50);
    }
    function tutupModalTulis() {
        if (!modalTulis) return;
        modalTulis.classList.add('opacity-0', 'pointer-events-none');
        modalTulis.classList.remove('opacity-100', 'pointer-events-auto');
        if (modalCard) modalCard.classList.add('scale-95');
        resetFormTulis();
    }

    if (tulisBtn) {
        tulisBtn.addEventListener('click', () => {
            if (!currentUser) {
                tampilkanNotifikasi("Silakan masuk terlebih dahulu untuk menulis", "#4a0e0e", "red");
                bukaModalMasuk();
                return;
            }
            resetFormTulis();
            bukaModalTulis();
        });
    }

    if (tutupModal) tutupModal.addEventListener('click', tutupModalTulis);

    if (pilihGambarTrigger && fileInput) {
        pilihGambarTrigger.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                selectedImageBase64 = ev.target.result;
                if (previewGambar) {
                    previewGambar.src = selectedImageBase64;
                    previewGambar.classList.remove('hidden');
                }
                if (placeholderContainer) placeholderContainer.classList.add('hidden');
            };
            reader.readAsDataURL(file);
        });
    }

    if (uploadBtn) {
        uploadBtn.addEventListener('click', async () => {
            const judul  = inputJudul ? inputJudul.value.trim() : '';
            const konten = inputKonten ? inputKonten.value.trim() : '';

            if (!judul || !konten) {
                tampilkanNotifikasi("Judul dan konten tidak boleh kosong", "#4a0e0e", "red");
                return;
            }
            if (!currentUser || !currentUserUid) {
                tampilkanNotifikasi("Silakan masuk terlebih dahulu", "#4a0e0e", "red");
                return;
            }
            if (!isSupabaseActive) {
                tampilkanNotifikasi("Database tidak tersedia", "#4a0e0e", "red");
                return;
            }

            // Validasi gambar
            if (!editingPostId && !selectedImageBase64) {
                tampilkanNotifikasi("Mohon unggah gambar sampul", "#4a0e0e", "red");
                return;
            }

            uploadBtn.disabled = true;
            uploadBtn.innerText = editingPostId ? "Menyimpan..." : "Mengunggah...";

            try {
                if (editingPostId) {
                    // ---- MODE UPDATE ----
                    console.log('🔄 UPDATE mode - ID:', editingPostId);

                    const updateData = {
                        judul,
                        konten,
                        deskripsi: konten.slice(0, 100)
                    };
                    // Gambar baru hanya update jika user pilih
                    if (selectedImageBase64) {
                        updateData.image = selectedImageBase64;
                    }

                    const { error, count } = await supabaseClient
                        .from('posts')
                        .update(updateData)
                        .eq('id', editingPostId);

                    if (error) {
                        console.error('❌ Update error:', error.message);
                        throw error;
                    }

                    console.log('✅ Update count:', count);

                    if (count === 0) {
                        console.warn('⚠️ RLS policy UPDATE menolak');
                        tampilkanNotifikasi("Update ditolak (cek RLS policy atau ownership)", "#4a0e0e", "red");
                        return;
                    }

                    tampilkanNotifikasi("Artikel berhasil diperbarui", "#0e4a2e", "green");
                } else {
                    // ---- MODE INSERT (artikel baru) ----
                    console.log('✏️ INSERT mode - UID:', currentUserUid);

                    const insertData = {
                        judul,
                        konten,
                        deskripsi: konten.slice(0, 100),
                        author: currentUser,
                        image: selectedImageBase64 || '',
                        user_id: currentUserUid  // ✅ HARUS ADA — RLS policy memerlukan ini
                    };

                    const { error, data } = await supabaseClient
                        .from('posts')
                        .insert([insertData])
                        .select();

                    if (error) {
                        console.error('❌ Insert error:', error.message);
                        throw error;
                    }

                    console.log('✅ Insert sukses:', data);
                    tampilkanNotifikasi("Artikel berhasil diunggah", "#0e4a2e", "green");
                }

                tutupModalTulis();
                await muatDataBlogs();

            } catch (err) {
                console.error("❌ Gagal menyimpan artikel:", err.message);
                tampilkanNotifikasi("Gagal menyimpan: " + err.message, "#4a0e0e", "red");
            } finally {
                uploadBtn.disabled = false;
                uploadBtn.innerText = editingPostId ? "Update Cerita" : "Upload Cerita";
            }
        });
    }

    /* ----------------------------------------------------------
       MODAL BACA: tutup
       ---------------------------------------------------------- */
    function tutupModalBaca() {
        if (!modalBaca) return;
        modalBaca.classList.add('opacity-0', 'pointer-events-none');
        modalBaca.classList.remove('opacity-100', 'pointer-events-auto');
        if (modalBacaCard) modalBacaCard.classList.add('scale-95', 'translate-y-4');
    }
    if (tutupBaca) tutupBaca.addEventListener('click', tutupModalBaca);

    // Tutup modal kalau klik di area gelap luar kartu (untuk semua modal)
    [
        [modalMasuk, modalMasukCard, tutupModalMasuk],
        [modalProfil, modalProfilCard, tutupModalProfil],
        [modalTulis, modalCard, tutupModalTulis],
        [modalBaca, modalBacaCard, tutupModalBaca]
    ].forEach(([overlay, card, closeFn]) => {
        if (!overlay) return;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeFn();
        });
    });
}
