// ============================================================
//  Blog Minimalis — main.js (REVISI FINAL)
//  Perbaikan: Update & Hapus artikel
// ============================================================

/* ---- State Global ---- */
let activeBlogs      = [];
let currentUser      = null;
let currentUserUid   = null;
let profileBioText   = "Saya menyukai keindahan kata-kata dan visual minimalis.";
let profileAvatarData = "";
let editingPostId    = null;

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
    if (!currentUser) return false;
    
    // Ambil username dari email
    const currentUsername = currentUser.includes('@') ? currentUser.split('@')[0] : currentUser;
    
    // Cek apakah author sama dengan currentUser atau username
    return blog.author === currentUser || blog.author === currentUsername;
}

/* ================================================================
   INISIALISASI — Dipanggil saat halaman home selesai dimuat
   ================================================================ */
window.onload = async function () {
    const pageLoader = document.getElementById('page-loader');
    const loaderText = document.getElementById('loader-text');
    const menuBar    = document.getElementById('menu-bar');
    const menuContent = document.getElementById('menu-content');

    // Cek session login
    const savedUser = sessionStorage.getItem('blogUser');
    const savedUid  = sessionStorage.getItem('blogUid');
    if (savedUser && savedUid) {
        currentUser = savedUser;
        currentUserUid = savedUid;
        console.log('✅ User ditemukan di session:', currentUser);
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
            if (pageLoader) {
                pageLoader.classList.add('opacity-0', 'pointer-events-none');
            }
        }, 500);
        return;
    }

    if (loaderText) {
        loaderText.innerText = "Memuat data dari Supabase...";
    }

    await muatDataBlogs();

    // 1. Splash screen memudar (500ms)
    setTimeout(() => {
        if (pageLoader) {
            pageLoader.classList.add('opacity-0', 'pointer-events-none');
        }
        tampilkanNotifikasi("Terhubung dengan database Supabase", "#0e4a2e", "green");
    }, 500);

    // 2. Pill muncul dari atas — kecil & tanpa konten (700ms)
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

    // 4. Konten fade in setelah navbar lebar sepenuhnya (1800ms)
    setTimeout(() => {
        if (menuContent) {
            menuContent.classList.remove('opacity-0', 'pointer-events-none');
            menuContent.classList.add('opacity-100', 'pointer-events-auto');
        }
    }, 1800);

    // Update UI untuk user yang login
    updateUserUI();

    // Pasang semua event listener setelah DOM siap
    pasangEventListeners();
};

/* ================================================================
   FUNGSI: Update UI berdasarkan status login
   ================================================================ */
function updateUserUI() {
    const masukBtn = document.getElementById('masuk-btn');
    const profilBtn = document.getElementById('profil-btn');
    
    if (currentUser) {
        if (masukBtn) masukBtn.innerText = `Keluar (${currentUser.split('@')[0]})`;
        if (profilBtn) profilBtn.classList.remove('hidden');
        console.log('👤 User login:', currentUser);
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
        console.warn("Supabase tidak aktif");
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
        
        // Debug: Tampilkan author dari setiap artikel
        activeBlogs.forEach(blog => {
            console.log(`📝 "${blog.judul}" oleh ${blog.author}`);
        });
    } catch (err) {
        console.error("Gagal mengambil data dari Supabase:", err);
        tampilkanNotifikasi("Gagal memuat data dari database", "#4a0e0e", "red");
        activeBlogs = [];
    }
    renderBlog();
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
        
        // Cek apakah user adalah pemilik artikel
        const isOwner = isArticleOwner(blog);
        
        console.log(`🔍 "${blog.judul}" - isOwner: ${isOwner}, currentUser: ${currentUser}, author: ${blog.author}`);

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
   FUNGSI: Edit Artikel (PERBAIKAN)
   ================================================================ */
function editArtikel(id) {
    console.log('✏️ Edit artikel ID:', id);
    
    const blog = activeBlogs.find(b => b.id === id);
    if (!blog) {
        tampilkanNotifikasi("Artikel tidak ditemukan", "#4a0e0e", "red");
        return;
    }

    // Cek kepemilikan dengan fungsi yang konsisten
    if (!isArticleOwner(blog)) {
        tampilkanNotifikasi("Anda tidak memiliki izin untuk mengedit artikel ini", "#4a0e0e", "red");
        console.warn('❌ Bukan pemilik artikel. Current user:', currentUser, 'Author:', blog.author);
        return;
    }

    // Set state editing
    editingPostId = id;
    console.log('✅ Edit mode aktif untuk ID:', editingPostId);
    
    // Isi form dengan data artikel
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
    
    // Buka modal tulis
    const modalTulis = document.getElementById('modal-tulis');
    const modalCard = document.getElementById('modal-card');
    
    if (modalTulis) {
        modalTulis.classList.remove('opacity-0', 'pointer-events-none');
        modalTulis.classList.add('opacity-100', 'pointer-events-auto');
        setTimeout(() => modalCard && modalCard.classList.remove('scale-95'), 50);
    }
}

/* ================================================================
   FUNGSI: Hapus Artikel (PERBAIKAN)
   ================================================================ */
async function hapusArtikel(id) {
    console.log('🗑️ Hapus artikel ID:', id);
    
    const blog = activeBlogs.find(b => b.id === id);
    if (!blog) {
        tampilkanNotifikasi("Artikel tidak ditemukan", "#4a0e0e", "red");
        return;
    }

    // Cek kepemilikan dengan fungsi yang konsisten
    if (!isArticleOwner(blog)) {
        tampilkanNotifikasi("Anda tidak memiliki izin untuk menghapus artikel ini", "#4a0e0e", "red");
        console.warn('❌ Bukan pemilik artikel. Current user:', currentUser, 'Author:', blog.author);
        return;
    }

    // Konfirmasi
    if (!confirm(`Apakah Anda yakin ingin menghapus artikel "${blog.judul}"?`)) {
        return;
    }

    if (!isSupabaseActive) {
        tampilkanNotifikasi("Database tidak tersedia", "#4a0e0e", "red");
        return;
    }

    try {
        console.log('🚀 Menghapus artikel ID:', id);
        
        const { error } = await supabaseClient
            .from('posts')
            .delete()
            .eq('id', id);

        if (error) {
            console.error('❌ Error dari Supabase:', error);
            throw error;
        }
        
        console.log('✅ Artikel berhasil dihapus');
        tampilkanNotifikasi(`Artikel "${blog.judul}" berhasil dihapus`, "#0e4a2e", "green");
        
        // Refresh data
        await muatDataBlogs();
    } catch (err) {
        console.error("❌ Gagal menghapus artikel:", err);
        tampilkanNotifikasi("Gagal menghapus artikel: " + err.message, "#4a0e0e", "red");
    }
}

/* ================================================================
   FUNGSI: Buka Modal Baca Artikel
   ================================================================ */
function bukaArtikel(id) {
    const blog = activeBlogs.find(b => b.id === id);
    if (!blog) return;

    document.getElementById('baca-gambar').src        = blog.image;
    document.getElementById('baca-author').innerText  = `Oleh ${blog.author}`;
    document.getElementById('baca-judul').innerText   = blog.judul;
    document.getElementById('baca-konten').innerText  = blog.konten;

    const modalBaca     = document.getElementById('modal-baca');
    const modalBacaCard = document.getElementById('modal-baca-card');

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
            profileBioText    = profile.bio       || profileBioText;
            profileAvatarData = profile.avatar_url || profileAvatarData;

            if (profileAvatarData) {
                const previewAvatar        = document.getElementById('preview-avatar');
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
        console.error("Gagal memuat profil Supabase:", err);
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
   FUNGSI: Pasang Semua Event Listener
   ================================================================ */
function pasangEventListeners() {

    /* ---- Referensi Elemen DOM ---- */
    const menuBar           = document.getElementById('menu-bar');
    const menuContent       = document.getElementById('menu-content');
    const extraMenu         = document.getElementById('extra-menu');
    const searchInput       = document.getElementById('search-input');
    const homeBtn           = document.getElementById('home-btn');
    const masukBtn          = document.getElementById('masuk-btn');
    const profilBtn         = document.getElementById('profil-btn');

    // Modal Masuk
    const modalMasuk        = document.getElementById('modal-masuk');
    const modalMasukCard    = document.getElementById('modal-masuk-card');
    const tutupMasuk        = document.getElementById('tutup-masuk');
    const mulaiBtn          = document.getElementById('mulai-btn');
    const tabMasuk          = document.getElementById('tab-masuk');
    const tabDaftar         = document.getElementById('tab-daftar');
    const loginUsername     = document.getElementById('login-username');
    const loginPassword     = document.getElementById('login-password');
    const loginConfirmPassword = document.getElementById('login-confirm-password');

    // Modal Profil
    const modalProfil       = document.getElementById('modal-profil');
    const modalProfilCard   = document.getElementById('modal-profil-card');
    const tutupProfil       = document.getElementById('tutup-profil');
    const simpanProfilBtn   = document.getElementById('simpan-profil-btn');
    const pilihAvatarTrigger = document.getElementById('pilih-avatar-trigger');
    const avatarInput       = document.getElementById('avatar-input');
    const previewAvatar     = document.getElementById('preview-avatar');
    const avatarPlaceholderTeks = document.getElementById('avatar-placeholder-teks');
    const profileDisplayName = document.getElementById('profile-display-name');
    const profileBio        = document.getElementById('profile-bio');
    const profileStatPosts  = document.getElementById('profile-stat-posts');

    // Modal Tulis
    const tulisBtn          = document.getElementById('tulis-btn');
    const modalTulis        = document.getElementById('modal-tulis');
    const modalCard         = document.getElementById('modal-card');
    const tutupModal        = document.getElementById('tutup-modal');
    const uploadBtn         = document.getElementById('upload-btn');
    const pilihGambarTrigger = document.getElementById('pilih-gambar-trigger');
    const fileInput         = document.getElementById('file-input');
    const previewGambar     = document.getElementById('preview-gambar');
    const placeholderContainer = document.getElementById('placeholder-container');
    const inputJudul        = document.getElementById('input-judul');
    const inputKonten       = document.getElementById('input-konten');

    // Modal Baca
    const tutupBaca         = document.getElementById('tutup-baca');
    const modalBaca         = document.getElementById('modal-baca');
    const modalBacaCard     = document.getElementById('modal-baca-card');

    let currentTab = 'masuk';

    /* ---- Toggle Dropdown Menu (hamburger) ---- */
    const menuToggleBtn = document.getElementById('menu-toggle-btn');
    const hamTop        = document.getElementById('ham-top');
    const hamBottom     = document.getElementById('ham-bottom');

    function openDropdown() {
        if (!extraMenu) return;
        extraMenu.classList.remove('max-h-0', 'opacity-0');
        extraMenu.classList.add('max-h-32', 'opacity-100');
        if (hamTop)    { hamTop.classList.add('rotate-45', 'translate-y-[3px]'); }
        if (hamBottom) { hamBottom.classList.add('-rotate-45', '-translate-y-[3px]'); }
    }

    function closeDropdown() {
        if (!extraMenu) return;
        extraMenu.classList.remove('max-h-32', 'opacity-100');
        extraMenu.classList.add('max-h-0', 'opacity-0');
        if (hamTop)    { hamTop.classList.remove('rotate-45', 'translate-y-[3px]'); }
        if (hamBottom) { hamBottom.classList.remove('-rotate-45', '-translate-y-[3px]'); }
    }

    function isDropdownOpen() {
        return extraMenu && extraMenu.classList.contains('max-h-32');
    }

    if (menuToggleBtn) {
        menuToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (isDropdownOpen()) { closeDropdown(); } else { openDropdown(); }
        });
    }

    document.addEventListener('click', (e) => {
        if (isDropdownOpen() && !e.target.closest('#menu-bar')) {
            closeDropdown();
        }
    });

    /* ---- Pencarian Live ---- */
    if (searchInput) {
        searchInput.addEventListener('input', (e) => renderBlog(e.target.value));
    }

    /* ---- Tombol Home ---- */
    if (homeBtn) {
        homeBtn.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            renderBlog();
        });
    }

    /* ---- Tab Masuk / Daftar ---- */
    if (tabMasuk) {
        tabMasuk.addEventListener('click', () => {
            currentTab = 'masuk';
            tabMasuk.className  = "text-4xl font-serif tracking-wide font-medium pb-2 text-white focus:outline-none transition duration-150";
            tabDaftar.className = "text-4xl font-serif tracking-wide font-medium pb-2 text-white/40 hover:text-white/80 focus:outline-none transition duration-150";
            if (loginUsername) loginUsername.placeholder = "Email atau Username";
            if (loginConfirmPassword) loginConfirmPassword.classList.add('hidden');
            if (mulaiBtn) mulaiBtn.innerText = "Mulai";
        });
    }

    if (tabDaftar) {
        tabDaftar.addEventListener('click', () => {
            currentTab = 'daftar';
            tabDaftar.className = "text-4xl font-serif tracking-wide font-medium pb-2 text-white focus:outline-none transition duration-150";
            tabMasuk.className  = "text-4xl font-serif tracking-wide font-medium pb-2 text-white/40 hover:text-white/80 focus:outline-none transition duration-150";
            if (loginUsername) loginUsername.placeholder = "Email";
            if (loginConfirmPassword) loginConfirmPassword.classList.remove('hidden');
            if (mulaiBtn) mulaiBtn.innerText = "Daftar Sekarang";
        });
    }

    /* ---- Buka / Tutup Modal Masuk ---- */
    function closeMasukModal() {
        if (!modalMasukCard || !modalMasuk) return;
        modalMasukCard.classList.add('scale-95');
        setTimeout(() => {
            modalMasuk.classList.remove('opacity-100', 'pointer-events-auto');
            modalMasuk.classList.add('opacity-0', 'pointer-events-none');
        }, 150);
    }

    if (masukBtn) {
        masukBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            closeDropdown();
            if (currentUser) {
                if (isSupabaseActive) await supabaseClient.auth.signOut();
                currentUser    = null;
                currentUserUid = null;
                sessionStorage.removeItem('blogUser');
                sessionStorage.removeItem('blogUid');
                masukBtn.innerText = "Masuk";
                if (profilBtn) profilBtn.classList.add('hidden');
                tampilkanNotifikasi("Anda berhasil keluar!", "#0e4a2e", "green");
                await muatDataBlogs();
                return;
            }
            if (!isSupabaseActive) {
                tampilkanNotifikasi("Database tidak tersedia", "#4a0e0e", "red");
                return;
            }
            if (modalMasuk) {
                modalMasuk.classList.remove('opacity-0', 'pointer-events-none');
                modalMasuk.classList.add('opacity-100', 'pointer-events-auto');
                setTimeout(() => modalMasukCard && modalMasukCard.classList.remove('scale-95'), 50);
            }
        });
    }

    if (tutupMasuk) tutupMasuk.addEventListener('click', closeMasukModal);

    /* ---- Aksi Login / Daftar ---- */
    if (mulaiBtn) {
        mulaiBtn.addEventListener('click', async () => {
            if (!isSupabaseActive) {
                tampilkanNotifikasi("Database tidak tersedia", "#4a0e0e", "red");
                return;
            }

            const emailOrUser = loginUsername ? loginUsername.value.trim() : '';
            const password    = loginPassword ? loginPassword.value : '';

            if (!emailOrUser || !password) {
                tampilkanNotifikasi("Mohon isi semua data!", "#4a0e0e", "red");
                return;
            }

            if (currentTab === 'daftar') {
                const confirmPassword = loginConfirmPassword ? loginConfirmPassword.value : '';
                if (password !== confirmPassword) {
                    tampilkanNotifikasi("Kedua kata sandi tidak cocok!", "#4a0e0e", "red");
                    return;
                }

                try {
                    const { data, error } = await supabaseClient.auth.signUp({ email: emailOrUser, password });
                    if (error) throw error;
                    tampilkanNotifikasi("Pendaftaran berhasil! Cek email verifikasi Anda.", "#0e4a2e", "green");
                    if (tabMasuk) tabMasuk.click();
                } catch (err) {
                    tampilkanNotifikasi(err.message, "#4a0e0e", "red");
                }
                return;
            }

            try {
                const { data, error } = await supabaseClient.auth.signInWithPassword({ email: emailOrUser, password });
                if (error) throw error;
                
                // PERBAIKAN: Simpan user data dengan benar
                currentUser = data.user.email;
                currentUserUid = data.user.id;
                
                console.log('✅ Login berhasil:', currentUser);
                console.log('🆔 User ID:', currentUserUid);
                
                sessionStorage.setItem('blogUser', currentUser);
                sessionStorage.setItem('blogUid', currentUserUid);
                
                if (masukBtn) masukBtn.innerText = `Keluar (${currentUser.split('@')[0]})`;
                if (profilBtn) profilBtn.classList.remove('hidden');
                await sinkronkanProfilSupabase();
                closeMasukModal();
                tampilkanNotifikasi(`Selamat datang kembali, ${currentUser.split('@')[0]}!`, "#0e4a2e", "green");
                await muatDataBlogs();
            } catch (err) {
                console.error('❌ Login error:', err);
                tampilkanNotifikasi(err.message, "#4a0e0e", "red");
            }
        });
    }

    /* ---- Buka / Tutup Modal Profil ---- */
    if (profilBtn) {
        profilBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!isSupabaseActive) {
                tampilkanNotifikasi("Database tidak tersedia", "#4a0e0e", "red");
                return;
            }
            
            if (profileDisplayName) profileDisplayName.value = currentUser;
            if (profileBio) profileBio.value = profileBioText;

            // PERBAIKAN: Hitung jumlah artikel dengan fungsi yang konsisten
            const postsCount = activeBlogs.filter(b => isArticleOwner(b)).length;
            if (profileStatPosts) profileStatPosts.innerText = postsCount;

            if (modalProfil) {
                modalProfil.classList.remove('opacity-0', 'pointer-events-none');
                modalProfil.classList.add('opacity-100', 'pointer-events-auto');
                setTimeout(() => modalProfilCard && modalProfilCard.classList.remove('scale-95'), 50);
            }
        });
    }

    if (tutupProfil) {
        tutupProfil.addEventListener('click', () => {
            if (modalProfilCard) modalProfilCard.classList.add('scale-95');
            setTimeout(() => {
                if (modalProfil) {
                    modalProfil.classList.remove('opacity-100', 'pointer-events-auto');
                    modalProfil.classList.add('opacity-0', 'pointer-events-none');
                }
            }, 150);
        });
    }

    /* ---- Simpan Profil ---- */
    if (simpanProfilBtn) {
        simpanProfilBtn.addEventListener('click', async () => {
            if (!isSupabaseActive || !currentUserUid) {
                tampilkanNotifikasi("Database tidak tersedia", "#4a0e0e", "red");
                return;
            }

            profileBioText = profileBio ? profileBio.value : profileBioText;

            try {
                const { error } = await supabaseClient.from('profiles').upsert({
                    id:         currentUserUid,
                    username:   currentUser.split('@')[0],
                    bio:        profileBioText,
                    avatar_url: profileAvatarData
                });
                if (error) throw error;
                tampilkanNotifikasi("Profil berhasil disimpan di Supabase!", "#0e4a2e", "green");
            } catch (err) {
                console.error(err);
                tampilkanNotifikasi("Gagal memperbarui profil di Supabase", "#4a0e0e", "red");
            }
            if (tutupProfil) tutupProfil.click();
        });
    }

    /* ---- Upload Avatar ---- */
    if (pilihAvatarTrigger && avatarInput) {
        pilihAvatarTrigger.addEventListener('click', () => avatarInput.click());
        avatarInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    if (previewAvatar) {
                        previewAvatar.src = ev.target.result;
                        previewAvatar.classList.remove('hidden');
                    }
                    if (avatarPlaceholderTeks) avatarPlaceholderTeks.classList.add('hidden');
                    profileAvatarData = ev.target.result;
                };
                reader.readAsDataURL(file);
            }
        });
    }

    /* ---- Buka / Tutup Modal Tulis ---- */
    function closeTulisModal() {
        // Reset form
        editingPostId = null;
        if (uploadBtn) uploadBtn.innerText = "Upload Cerita";
        if (inputJudul) inputJudul.value = "";
        if (inputKonten) inputKonten.value = "";
        if (previewGambar) {
            previewGambar.classList.add('hidden');
            previewGambar.src = "";
        }
        if (placeholderContainer) placeholderContainer.classList.remove('hidden');
        
        if (modalCard) modalCard.classList.add('scale-95');
        setTimeout(() => {
            if (modalTulis) {
                modalTulis.classList.remove('opacity-100', 'pointer-events-auto');
                modalTulis.classList.add('opacity-0', 'pointer-events-none');
            }
        }, 150);
    }

    if (tulisBtn) {
        tulisBtn.addEventListener('click', () => {
            if (!isSupabaseActive) {
                tampilkanNotifikasi("Database tidak tersedia", "#4a0e0e", "red");
                return;
            }
            
            if (!currentUser) {
                tampilkanNotifikasi("Silakan login terlebih dahulu", "#4a0e0e", "red");
                if (modalMasuk) {
                    modalMasuk.classList.remove('opacity-0', 'pointer-events-none');
                    modalMasuk.classList.add('opacity-100', 'pointer-events-auto');
                    setTimeout(() => modalMasukCard && modalMasukCard.classList.remove('scale-95'), 50);
                }
                return;
            }
            
            // Reset form untuk menulis baru
            editingPostId = null;
            if (uploadBtn) uploadBtn.innerText = "Upload Cerita";
            if (inputJudul) inputJudul.value = "";
            if (inputKonten) inputKonten.value = "";
            if (previewGambar) {
                previewGambar.classList.add('hidden');
                previewGambar.src = "";
            }
            if (placeholderContainer) placeholderContainer.classList.remove('hidden');
            
            if (modalTulis) {
                modalTulis.classList.remove('opacity-0', 'pointer-events-none');
                modalTulis.classList.add('opacity-100', 'pointer-events-auto');
                setTimeout(() => modalCard && modalCard.classList.remove('scale-95'), 50);
            }
        });
    }

    if (tutupModal) tutupModal.addEventListener('click', closeTulisModal);

    /* ---- Pilih Gambar Sampul Artikel ---- */
    if (pilihGambarTrigger && fileInput) {
        pilihGambarTrigger.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (ev) => {
                    if (previewGambar) {
                        previewGambar.src = ev.target.result;
                        previewGambar.classList.remove('hidden');
                    }
                    if (placeholderContainer) placeholderContainer.classList.add('hidden');
                };
                reader.readAsDataURL(file);
            }
        });
    }

    /* ---- Upload / Update Artikel (PERBAIKAN) ---- */
    if (uploadBtn) {
        uploadBtn.addEventListener('click', async () => {
            if (!isSupabaseActive) {
                tampilkanNotifikasi("Database tidak tersedia", "#4a0e0e", "red");
                return;
            }

            const judul  = inputJudul  ? inputJudul.value.trim()  : '';
            const konten = inputKonten ? inputKonten.value.trim() : '';

            if (!judul || !konten) {
                tampilkanNotifikasi("Isi judul & konten!", "#4a0e0e", "red");
                return;
            }

            const imgSrc     = (previewGambar && previewGambar.src && !previewGambar.classList.contains('hidden'))
                ? previewGambar.src
                : "https://images.unsplash.com/photo-1544005313-94ddf0286df2?q=80&w=400&auto=format&fit=crop";
            const authorName = currentUser
                ? (currentUser.includes('@') ? currentUser.split('@')[0] : currentUser)
                : "Anda";

            const colors = [
                "bg-[#4a0e0e] hover:bg-[#5f1414]",
                "bg-[#0e244a] hover:bg-[#143265]",
                "bg-[#0e4a2e] hover:bg-[#14653f]"
            ];
            const selectedColor = colors[Math.floor(Math.random() * colors.length)];

            try {
                if (editingPostId) {
                    // MODE EDIT: Update artikel yang ada
                    console.log('🔄 Mengupdate artikel ID:', editingPostId);
                    
                    const { error } = await supabaseClient
                        .from('posts')
                        .update({
                            judul,
                            konten,
                            deskripsi: konten.substring(0, 45) + "...",
                            image: imgSrc,
                            color: selectedColor
                        })
                        .eq('id', editingPostId);

                    if (error) {
                        console.error('❌ Error update:', error);
                        throw error;
                    }
                    
                    console.log('✅ Artikel berhasil diupdate');
                    tampilkanNotifikasi("Artikel berhasil diperbarui!", "#0e4a2e", "green");
                } else {
                    // MODE TAMBAH: Buat artikel baru
                    console.log('📝 Membuat artikel baru');
                    
                    const postObj = {
                        judul,
                        author:    authorName,
                        deskripsi: konten.substring(0, 45) + "...",
                        konten,
                        image:     imgSrc,
                        color:     selectedColor
                    };

                    const { error } = await supabaseClient.from('posts').insert([postObj]);
                    if (error) {
                        console.error('❌ Error insert:', error);
                        throw error;
                    }
                    
                    console.log('✅ Artikel berhasil dibuat');
                    tampilkanNotifikasi("Cerita berhasil dipos ke Supabase!", "#0e4a2e", "green");
                }
            } catch (err) {
                console.error("❌ Gagal menyimpan artikel:", err);
                tampilkanNotifikasi("Gagal menyimpan: " + err.message, "#4a0e0e", "red");
            }

            await muatDataBlogs();
            closeTulisModal();
        });
    }

    /* ---- Tutup Modal Baca ---- */
    if (tutupBaca) {
        tutupBaca.addEventListener('click', () => {
            if (modalBacaCard) modalBacaCard.classList.add('scale-95', 'translate-y-4');
            setTimeout(() => {
                if (modalBaca) {
                    modalBaca.classList.remove('opacity-100', 'pointer-events-auto');
                    modalBaca.classList.add('opacity-0', 'pointer-events-none');
                }
            }, 200);
        });
    }
}