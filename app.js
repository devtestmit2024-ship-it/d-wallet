// app.js (ถอดโหมดกลางคืนออกเรียบร้อย)

// 📌 ป้องกัน Pinch-to-zoom และ Gesture Zoom บน iOS Safari / Mobile Browsers
document.addEventListener('gesturestart', function (e) {
  e.preventDefault();
});
document.addEventListener('gesturechange', function (e) {
  e.preventDefault();
});
document.addEventListener('gestureend', function (e) {
  e.preventDefault();
});
document.addEventListener('touchstart', function (e) {
  if (e.touches.length > 1) {
    e.preventDefault();
  }
}, { passive: false });

const getApi = () => window.api;
const app = document.querySelector('#app');
const toast = document.querySelector('#toast');
let session = JSON.parse(sessionStorage.getItem('benefit-session') || 'null');
let currentCoupon = null;
let couponTimer = null;
let couponChannel = null;
let currentView = 'auth'; 

async function clearCouponData(phone) {
  const userPhone = phone || session?.user?.phone || session?.user?.Phone_No || currentCoupon?.phone;
  if (!userPhone) return;
  try {
    if (window.api && typeof window.api.resetExpiredCoupon === 'function') {
      await window.api.resetExpiredCoupon(userPhone);
    }
  } catch (err) {
    console.error('ไม่สามารถเคลียร์ค่าคูปองได้:', err);
  }
}

let inactivityTimer = null;
const INACTIVITY_LIMIT = 15 * 60 * 1000;

function cleanupSubscriptions() {
  if (couponChannel && window.supabaseClient) {
    window.supabaseClient.removeChannel(couponChannel);
    couponChannel = null;
  }
}

function resetInactivityTimer() {
  clearTimeout(inactivityTimer);
  if (session) {
    inactivityTimer = setTimeout(async () => {
      showToast('หมดเวลาการใช้งานเนื่องจากไม่มีการเคลื่อนไหว');
      await logoutUser();
    }, INACTIVITY_LIMIT);
  }
}

async function logoutUser() {
  clearTimeout(inactivityTimer);
  clearInterval(couponTimer);
  cleanupSubscriptions();
  if (session?.user) await clearCouponData();
  const phone = session?.user?.phone || session?.user?.Phone_No;
  if (phone && window.api?.releaseUserUsage) {
    try {
      await window.api.releaseUserUsage(phone);
    } catch (err) {
      console.error('ไม่สามารถคืนสถานะ IsUse:', err);
    }
  }
  sessionStorage.clear();
  session = null;
  currentCoupon = null;
  renderAuth();
}

['click', 'mousemove', 'keypress', 'scroll', 'touchstart'].forEach(event => {
  window.addEventListener(event, resetInactivityTimer);
});

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[c]));
const showToast = text => { toast.textContent = text; toast.classList.add('show'); setTimeout(() => toast.classList.remove('show'), 3000); };
const saveSession = value => { session = value; sessionStorage.setItem('benefit-session', JSON.stringify(value)); resetInactivityTimer(); };
const buttonLoading = (button, on) => { button.disabled = on; button.dataset.label ||= button.innerHTML; button.innerHTML = on ? '<span class="spinner"></span> กรุณารอสักครู่' : button.dataset.label; };

// เมื่อปิดหน้าเว็บ/แอป ให้คืนสถานะ IsUse โดยไม่รอให้หน้าเว็บทำงานต่อ
function releaseUsageOnDisconnect() {
  const phone = session?.user?.phone || session?.user?.Phone_No;
  if (phone && window.api?.releaseUserUsage) {
    window.api.releaseUserUsage(phone, { keepalive: true });
  }
}

window.addEventListener('pagehide', releaseUsageOnDisconnect);
window.addEventListener('beforeunload', releaseUsageOnDisconnect);
window.addEventListener('offline', releaseUsageOnDisconnect);

function layout(content, back = false) {
  app.innerHTML = `<section class="shell">
    <header class="topbar ${currentView === 'auth' ? 'topbar-login' : ''}" style="display: flex; justify-content: space-between; align-items: center;">
  <!-- ฝั่งซ้าย: ปุ่มย้อนกลับ (ถ้ามี) -->
  <div style="display: flex; align-items: center; gap: 0.75rem;">
    ${back ? '<button class="back" id="back" type="button" aria-label="ย้อนกลับ"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 18l-6-6 6-6"/></svg></button>' : ''}
  </div>

  <!-- ฝั่งขวา: ปุ่มออกจากระบบ -->
  <div class="topbar-actions" style="display: flex; align-items: center; gap: 0.5rem;">
    ${session ? '<button class="logout" id="logout"><span aria-hidden="true">↪</span> ออกจากระบบ</button>' : ''}
  </div>
</header>
    ${content}
  </section>`;
  
  document.querySelector('#back')?.addEventListener('click', async () => {
    if (currentView === 'coupon' && !confirm('ต้องการยกเลิกการแสดง QR และกลับไปหน้าเลือกสินค้าหรือไม่?')) {
      return;
    }
    if (['confirm', 'coupon', 'history'].includes(currentView)) {
      clearInterval(couponTimer);
      cleanupSubscriptions();
      if (currentView === 'coupon') await clearCouponData();
      currentCoupon = null;
      renderProducts();
    } else if (currentView === 'forgot-password') {
      renderAuth();
    } else if (currentView === 'recovery-password') {
      renderForgotPassword();
    }
  });

  document.querySelector('#logout')?.addEventListener('click', async () => {
    if (confirm('คุณต้องการออกจากระบบใช่หรือไม่?')) await logoutUser();
  });
}

// --- หน้าเข้าสู่ระบบ ---
function renderAuth() {
  currentView = 'auth';
  clearInterval(couponTimer);
  cleanupSubscriptions();
  clearTimeout(inactivityTimer);

 layout(`<div class="auth-wrap"><div class="hero"><img src="public/assets/image/icon-192.png" alt="D Wallet" class="hero-logo" style="width: 100px; height: 100px; object-fit: contain; margin-bottom: 0.5rem; border-radius: 8px;"><div class="login-brand-name">D Wallet</div><h2>เข้าสู่ระบบเพื่อรับสิทธิ์</h2><p>กรอกเบอร์โทรศัพท์และรหัสผ่านเพื่อเข้าใช้งาน</p></div>
  <form class="card auth-card" id="auth-form">
    <label>เบอร์โทรศัพท์<input required name="phone" inputmode="tel" pattern="0[0-9]{8,9}" placeholder="08x-xxx-xxxx" autocomplete="tel"></label>
    <label>รหัสผ่าน<input required name="password" type="password" minlength="4" placeholder="กรอกรหัสผ่าน" autocomplete="current-password"></label>
    <button class="primary" type="submit">เข้าสู่ระบบ <span>→</span></button>
    <p class="forgot-password"><button id="forgot-password" type="button">ลืมรหัสผ่าน?</button></p>
  </form></div>`);

  document.querySelector('#forgot-password').onclick = renderForgotPassword;

  // Chrome อนุญาตให้เปิดหน้าติดตั้ง PWA ได้จากการแตะของผู้ใช้เท่านั้น
  // จึงใช้การแตะครั้งแรกบนหน้า Login เพื่อเรียกกล่องติดตั้งของ Chrome โดยไม่มีปุ่มติดตั้งในหน้า
  document.querySelector('.auth-wrap')?.addEventListener('pointerdown', () => {
    window.requestPwaInstall?.();
  }, { once: true });

  document.querySelector('#auth-form').onsubmit = async e => {
    e.preventDefault(); 
    const btn = e.submitter; 
    const values = Object.fromEntries(new FormData(e.currentTarget));

    buttonLoading(btn, true);
    try { 
      const loginRes = await api.login(values);
      saveSession(loginRes);

      if (loginRes.user?.isDefaultPassword) {
        renderForceChangePassword();
      } else {
        renderProducts();
      }
    }
    catch (err) { 
      showToast(err.message); 
      buttonLoading(btn, false); 
    }
  };
}

// --- กู้รหัสผ่าน ---
function renderForgotPassword() {
  currentView = 'forgot-password';
  clearTimeout(inactivityTimer);
  layout(`<div class="auth-wrap"><div class="hero"><span class="hero-icon">🔐</span><h2>ลืมรหัสผ่าน</h2><p>ยืนยันตัวตนด้วยเบอร์โทรศัพท์และบ้านเลขที่</p></div><form class="card auth-card" id="forgot-password-form"><label>เบอร์โทรศัพท์<input required name="phone" inputmode="tel" pattern="0[0-9]{8,9}" placeholder="08x-xxx-xxxx" autocomplete="tel"></label><label>บ้านเลขที่<input required name="address" placeholder="เช่น 99/1" autocomplete="street-address"></label><button class="primary" type="submit">ยืนยันข้อมูล <span>→</span></button></form></div>`, true);
  document.querySelector('#forgot-password-form').onsubmit = async e => {
    e.preventDefault();
    const btn = e.submitter;
    buttonLoading(btn, true);
    try {
      const recovery = await api.verifyPasswordRecovery(Object.fromEntries(new FormData(e.currentTarget)));
      saveSession(recovery);
      renderRecoveryPassword();
    } catch (err) { showToast(err.message); buttonLoading(btn, false); }
  };
}

function renderRecoveryPassword() {
  currentView = 'recovery-password';
  layout(`<div class="auth-wrap"><div class="hero"><span class="hero-icon">✓</span><h2>ตั้งรหัสผ่านใหม่</h2><p>กรอกรหัสผ่านใหม่และยืนยันอีกครั้ง</p></div><form class="card auth-card" id="recovery-password-form"><label>รหัสผ่านใหม่<input required name="newPassword" type="password" minlength="4" placeholder="อย่างน้อย 4 ตัวอักษร" autocomplete="new-password"></label><label>ยืนยันรหัสผ่านใหม่<input required name="confirmPassword" type="password" minlength="4" placeholder="กรอกรหัสผ่านใหม่อีกครั้ง" autocomplete="new-password"></label><button class="primary" type="submit">บันทึกรหัสผ่านใหม่ <span>→</span></button></form></div>`, true);
  document.querySelector('#recovery-password-form').onsubmit = async e => {
    e.preventDefault();
    const btn = e.submitter;
    const { newPassword, confirmPassword } = Object.fromEntries(new FormData(e.currentTarget));
    if (newPassword !== confirmPassword) return showToast('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน');
    buttonLoading(btn, true);
    try { await api.changePassword({ phone: session.user.phone, newPassword }); showToast('ตั้งรหัสผ่านใหม่สำเร็จ กรุณาเข้าสู่ระบบ'); await logoutUser(); }
    catch (err) { showToast(err.message); buttonLoading(btn, false); }
  };
}

// --- หน้าบังคับเปลี่ยนรหัสผ่านครั้งแรก ---
function renderForceChangePassword() {
  currentView = 'change-password';
  cleanupSubscriptions();

  layout(`
    <div class="auth-wrap">
      <div class="hero">
        <span class="hero-icon">🔒</span>
        <h2>เปลี่ยนรหัสผ่านเข้าใช้งานครั้งแรก</h2>
        <p>เนื่องจากนี่เป็นการเข้าใช้งานครั้งแรก กรุณาตั้งรหัสผ่านใหม่เพื่อความปลอดภัย</p>
      </div>
      <form class="card auth-card" id="change-pwd-form">
        <label>รหัสผ่านใหม่<input required name="newPassword" type="password" minlength="4" placeholder="อย่างน้อย 4 ตัวอักษร (ห้ามตั้ง 1234)"></label>
        <label>ยืนยันรหัสผ่านใหม่<input required name="confirmPassword" type="password" minlength="4" placeholder="กรอกรหัสผ่านใหม่อีกครั้ง"></label>
        <button class="primary" type="submit">ยืนยันเปลี่ยนรหัสผ่าน <span>→</span></button>
      </form>
    </div>
  `, false);

  document.querySelector('#change-pwd-form').onsubmit = async e => {
    e.preventDefault();
    const btn = e.submitter;
    const { newPassword, confirmPassword } = Object.fromEntries(new FormData(e.currentTarget));

    if (newPassword === '1234') {
      showToast('รหัสผ่านต้องไม่เป็น 1234 กรุณาตั้งรหัสผ่านอื่น');
      return;
    }

    if (newPassword !== confirmPassword) {
      showToast('รหัสผ่านและการยืนยันรหัสผ่านไม่ตรงกัน');
      return;
    }

    buttonLoading(btn, true);
    try {
      await api.changePassword({ phone: session.user.phone, newPassword });
      session.user.isDefaultPassword = false;
      saveSession(session);
      showToast('เปลี่ยนรหัสผ่านสำเร็จ');
      renderProducts();
    } catch (err) {
      showToast(err.message);
      buttonLoading(btn, false);
    }
  };
}

// --- หน้าเลือกสินค้า ---
async function renderProducts() {
  currentView = 'products';
  cleanupSubscriptions();
  resetInactivityTimer();
  layout('<div class="page-title"><h2>เลือกรายการสินค้า</h2><span>เลือกสิทธิ์ที่คุณต้องการรับในครั้งนี้</span></div><div class="loading"><span class="spinner dark"></span> กำลังโหลดรายการ</div>', false);
  
  try {
    const products = await api.products(session.token);
    const user = session?.user || {};
    const userPhone = user.phone || user.Phone_No;

    const usedToday = (api && typeof api.checkTodayBillUsage === 'function')
      ? await api.checkTodayBillUsage(userPhone)
      : false;

    const usedCount = user.usedCount ?? user.All_Use ?? 0;
    const allLimit = user.All_Limit ?? 50;

    const userInfoHtml = `
      <div class="card user-info-card" style="padding: 1rem;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
          <div>
            <p><strong>ชื่อ:</strong> ${esc(user.name || user.Name || '-')}</p>
            <p><strong>เบอร์โทร:</strong> ${esc(userPhone || '-')}</p>
            <p><strong>บ้านเลขที่:</strong> ${esc(user.address || user.House_Number || '-')}</p>
          </div>
        </div>
        <p style="margin-top: 0.5rem; color: #059669; font-weight: bold;">
          สิทธิ์ที่ใช้ไปแล้ว: ${usedCount}/${allLimit} แก้ว
        </p>
        ${usedToday ? '<p style="margin-top: 0.25rem; color: #ef4444; font-size: 0.875rem; font-weight: bold;">⚠️ วันนี้ใช้สิทธิ์ไปแล้ว</p>' : ''}
      </div>
    `;

    const historyActionHtml = `<div class="history-action"><button id="btn-history" type="button" class="secondary">📜 ประวัติการใช้สิทธิ์</button></div>`;

    const productListHtml = `
      <div class="product-list">
        ${products.map(p => `
          <button class="product" data-id="${esc(p.id)}" ${usedToday ? 'style="opacity: 0.6; cursor: not-allowed;"' : ''}>
            <span class="product-icon ${esc(p.color)}">
              ${p.image ? `<img src="${esc(p.image)}" alt="${esc(p.name)}" style="width:100%;height:100%;object-fit:cover;border-radius:8px;" />` : esc(p.icon || '☕')}
            </span>
            <span>
              <strong>${esc(p.name)}</strong>
              <small>${esc(p.detail)}</small>
            </span>
            <i>${usedToday ? 'ใช้สิทธิ์แล้ว' : 'เลือก'}</i>
          </button>
        `).join('')}
      </div>
    `;

    layout(`<div class="page-title"><h2>เลือกรายการสินค้า</h2></div>${userInfoHtml}${historyActionHtml}${productListHtml}`, false);
    
    document.querySelector('#btn-history')?.addEventListener('click', () => renderHistory());

    document.querySelectorAll('.product').forEach(el => el.onclick = () => {
      if (usedToday) {
        alert('⚠️ วันนี้คุณได้ใช้สิทธิ์ไปแล้ว ไม่สามารถใช้ซ้ำได้');
        return;
      }
      renderConfirm(products.find(p => p.id === el.dataset.id));
    });

  } catch (err) { 
    showToast(err.message); 
    app.innerHTML = `<div class="card" style="text-align:center; padding: 2rem;">
      <p style="color:red; margin-bottom:1rem;">${esc(err.message)}</p>
      <button class="primary" onclick="renderProducts()">ลองใหม่อีกครั้ง</button>
    </div>`;
  }
}

// --- หน้า ประวัติการใช้สิทธิ์ ---
async function renderHistory() {
  currentView = 'history';
  cleanupSubscriptions();
  resetInactivityTimer();

  layout('<div class="page-title"><h2>รายงานประวัติการใช้สิทธิ์</h2></div><div class="loading"><span class="spinner dark"></span> กำลังดึงข้อมูล...</div>', true);

  try {
    const user = session?.user || {};
    const userPhone = user.phone || user.Phone_No;
    
    const [historyList, products] = await Promise.all([
      window.api.checkHistory(userPhone),
      window.api.products(session.token)
    ]);

    const productMap = {};
    products.forEach(p => { productMap[p.id] = p; });

    const historyRows = historyList.length > 0 
      ? historyList.map((item, index) => {
        const product = productMap[item.productId] || { name: 'เครื่องดื่ม Cafe Amazon' };
        
        const imgHtml = product.image 
          ? `<img src="${esc(product.image)}" alt="${esc(product.name)}" style="width:40px; height:40px; object-fit:cover; border-radius:8px; flex-shrink:0;">`
          : `<div style="width:40px; height:40px; background:#e3f6ed; border-radius:8px; display:grid; place-items:center; font-size:18px; flex-shrink:0;">☕</div>`;

        return `
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 0.75rem 0.25rem; text-align: center; vertical-align: middle;">${index + 1}</td>
            <td style="padding: 0.75rem 0.5rem; vertical-align: middle;">
              <div style="display: flex; align-items: center; gap: 10px;">
                ${imgHtml}
                <div>
                  <strong style="font-size: 0.95rem; line-height: 1.2; display: block;">${esc(product.name)}</strong>
                  <small style="color: #6b7280; font-size: 0.75rem;">เลขที่บิล: ${esc(item.billNo)}</small>
                </div>
              </div>
            </td>
            <td style="padding: 0.75rem 0.5rem; text-align: right; vertical-align: middle; font-size: 0.8rem; color: #4b5563;">${esc(item.useDate)}</td>
          </tr>
        `;
      }).join('')
      : `<tr><td colspan="3" style="text-align: center; padding: 2rem; color: #6b7280;">ยังไม่มีประวัติการใช้สิทธิ์</td></tr>`;

    layout(`
      <div class="page-title"><h2>ประวัติการใช้สิทธิ์</h2><span>เบอร์โทร: ${esc(userPhone)}</span></div>
      <div class="card" style="padding: 0.5rem; overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="border-bottom: 2px solid #d1d5db; background: #f3f4f6;">
              <th style="padding: 0.5rem; text-align: center;">ลำดับ</th>
              <th style="padding: 0.5rem; text-align: left;">รายการสินค้า / เลขที่บิล</th>
              <th style="padding: 0.5rem; text-align: right;">วันที่-เวลา</th>
            </tr>
          </thead>
          <tbody>${historyRows}</tbody>
        </table>
      </div>
    `, true);
  } catch (err) {
    showToast(err.message);
  }
}

// --- หน้า ยืนยันสิทธิ์ ---
function renderConfirm(product) {
  currentView = 'confirm';
  cleanupSubscriptions();
  resetInactivityTimer();
  const user = session.user || {};

  const productVisual = product.image ? `<img class="confirm-product-image" src="${esc(product.image)}" alt="${esc(product.name)}">` : `<span class="confirm-product-fallback" aria-hidden="true">${esc(product.icon || '☕')}</span>`;
  layout(`<div class="page-title"><h2>ยืนยันรับสิทธิ์</h2><span>ตรวจสอบรายการที่คุณเลือกก่อนสร้าง QR</span></div><div class="card selected product-confirm">${productVisual}<div><small>รายการที่เลือก</small><strong>${esc(product.name)}</strong><em>${esc(product.detail || '')}</em></div></div><form class="card details confirmation-action" id="coupon-form"><button class="primary" type="submit">ยืนยันและสร้าง QR <span>→</span></button></form>`, true);
  
  document.querySelector('#coupon-form').onsubmit = async e => {
    e.preventDefault(); 
    const btn = e.submitter; 
    buttonLoading(btn, true);
    try { 
      currentCoupon = await api.createCoupon({
        productId: product.id,
        phone: user.phone || user.Phone_No,
        address: user.address || user.House_Number,
        Confirm_Coupon: false
      }, session.token); 
      currentCoupon.product = product; 
      renderCoupon(); 
    } catch (err) { 
      showToast(err.message); 
      buttonLoading(btn, false); 
    }
  };
}

// --- หน้า แสดง QR Code ---
function renderCoupon() {
  currentView = 'coupon';
  cleanupSubscriptions();
  resetInactivityTimer();
  const c = currentCoupon;

  layout(`
    <div class="coupon-head">
      <h2>แสดง QR ให้พนักงานสแกน</h2>
    </div>
    <section class="coupon">
      <div class="qr-wrap">
        <div id="qrcode"></div>
      </div>
      <p class="coupon-id">รหัสคูปอง: <b>${esc(c.id)}</b></p>
      <div class="expiry">
        <span>⏱</span><strong id="countdown">03:00</strong>
      </div>
    </section>
  `, true);
  
  const payload = JSON.stringify({ 
    couponId: c.id, 
    productId: c.productId, 
    address: c.address, 
    phone: c.phone, 
    expiresAt: c.expiresAt 
  });
  if (window.QRCode) {
    new QRCode(document.querySelector('#qrcode'), { 
      text: payload, 
      width: 220, 
      height: 220, 
      colorDark: '#102b23', 
      colorLight: '#ffffff' 
    });
  }

  const completeAndRefresh = async () => {
    clearInterval(couponTimer);
    cleanupSubscriptions();
    currentCoupon = null;
    showToast('ใช้คูปองสำเร็จแล้ว!');
    await renderProducts();
  };

  if (window.supabaseClient && c.phone) {
    couponChannel = window.supabaseClient
      .channel(`coupon-check-${c.id}`)
      .on(
        'postgres_changes',
        { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'Cafe_Amazon_Promosion_House', 
          filter: `Phone_No=eq.${c.phone}` 
        },
        payload => {
          if (payload.new && payload.new.Confirm_Coupon === true) {
            completeAndRefresh();
          }
        }
      )
      .subscribe();
  }

  let pollCounter = 0;
  const update = async () => { 
    const secs = Math.max(0, Math.ceil((c.expiresAt - Date.now()) / 1000)); 
    const el = document.querySelector('#countdown'); 
    if (el) {
      el.textContent = `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`; 
    }

    pollCounter++;
    if (pollCounter % 3 === 0 && window.api && c.phone) {
      try {
        const isUsed = await window.api.checkTodayBillUsage(c.phone);
        if (isUsed) {
          await completeAndRefresh();
          return;
        }
      } catch (err) {
        console.warn('Error checking coupon status:', err);
      }
    }

    if (secs <= 0) { 
      clearInterval(couponTimer); 
      cleanupSubscriptions();
      await clearCouponData(c.phone);
      showToast('คูปองหมดอายุแล้ว');
      renderProducts();
    } 
  }; 
  
  update(); 
  couponTimer = setInterval(update, 1000);

}

// --- หน้าสำเร็จ ---
function renderSuccessView() {
  currentView = 'success';
  cleanupSubscriptions();

  layout(`
    <div style="min-height: 70vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center;">
      <div style="width: 80px; height: 80px; background: #d1fae5; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 2.5rem; color: #059669; margin-bottom: 1rem;">✓</div>
      <h2 style="font-size: 1.5rem; color: #fff;">ใช้สิทธิ์สำเร็จแล้ว!</h2>
      <p style="color: #fff; margin-bottom: 1.5rem;">ระบบบันทึกรายการสิทธิ์และออกใบเสร็จเรียบร้อยแล้ว</p>
      <button id="btn-confirm-success" class="primary" style="width: 100%; max-width: 280px;">ตกลง</button>
    </div>
  `, false);

  document.querySelector('#btn-confirm-success').onclick = () => {
    currentCoupon = null;
    renderProducts();
  };
}

// เริ่มต้นแอป
if (session) {
  if (session.user?.isDefaultPassword) {
    renderForceChangePassword();
  } else {
    renderProducts();
  }
} else {
  renderAuth();
}
