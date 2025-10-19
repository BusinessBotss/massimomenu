// Main application script extracted from index.html
// It expects the partials to be loaded into the DOM before initApp() runs.

const CONFIG = {
  WEB_APP_URL: "https://script.google.com/macros/s/AKfycbzBQ8iGtPriEqaW8k27Bw5IHCIBRUmp__lG68j1b1AusHJOEzp0Zig7q49oeIfpXfZz/exec",
  LOGO_URL: "https://res.cloudinary.com/dxhef6dju/image/upload/v1760817546/2_xm9rjm.png",
  SITE_URL: "https://school-1tryout.my.canva.site/welcome-to-massimo-s-pizza/#page-1",
  WHATSAPP: "+34611260259",
  STORE_NAME: "Massimo's Pizza",
  STORE_LOCATION: "Magaluf, Mallorca"
};

const defaultConfig = { restaurant_name: "Massimo's Pizza", whatsapp_number: "+34611260259" };

function esc(str) { if (typeof str !== 'string') return str; const div = document.createElement('div'); div.textContent = str; return div.innerHTML; }
function debounce(func, wait) { let timeout; return function executedFunction(...args) { const later = () => { clearTimeout(timeout); func(...args); }; clearTimeout(timeout); timeout = setTimeout(later, wait); }; }
function formatPrice(price) { return new Intl.NumberFormat('en',{ style:'currency', currency:'EUR'}).format(price); }

// Minimal fallback menu (empty) - primary source is Google Sheet
const MENU_DATA = [];

let state = { items: MENU_DATA, categories: [], cart: JSON.parse(localStorage.getItem('massimos_cart_v1') || '[]'), filters: { category:'all', q:'' } };

// Smart menu cache with background refresh
const MENU_CACHE_KEY = 'massimos_menu_cache_v1';
const MENU_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Normalize menu items from various response formats
function normalizeMenuItems(items) {
  return items.map((row, i) => {
    // Support different column names from sheets
    const sku = row.sku || row.SKU || row.id || `sku-${i}`;
    const name = row.name || row.Nombre || row.title || '';
    const description = row.description || row.Descripcion || row.desc || '';
    const price = Number(row.price || row.Precio || row.Price || 0) || 0;
    const category = row.category || row.Categoria || row.group || 'Uncategorized';
    const available = (typeof row.available !== 'undefined') ? (row.available === true || row.available === 'true' || row.available === 1 || row.available === '1') : true;
    const variants = Array.isArray(row.variants) ? row.variants : (row.variants ? JSONparseSafe(row.variants) || [] : []);
    const extras = Array.isArray(row.extras) ? row.extras : (row.extras ? JSONparseSafe(row.extras) || [] : []);
    return { sku, name, description, price, category, available, variants, extras };
  });
}

// Fetch fresh menu data from API
async function fetchMenuFromAPI(silent = false) {
  if (!silent) {
    const container = document.getElementById('products-container');
    if (container) container.innerHTML = `<div class="loading-spinner" style="text-align:center;padding:48px;"><div class="spinner" aria-hidden="true" style="width:48px;height:48px;border:6px solid var(--beige);border-top-color:var(--red);border-radius:50%;margin:0 auto 12px;animation:spin 1s linear infinite"></div><div>Loading menu...</div></div>`;
  }
  
  const resp = await fetch(CONFIG.WEB_APP_URL, { method: 'GET', cache: 'no-cache' });
  if (!resp.ok) throw new Error('Network response not ok');
  const data = await resp.json();
  
  // Extract items array from response
  let items = [];
  if (Array.isArray(data)) items = data;
  else if (data && Array.isArray(data.items)) items = data.items;
  if (!items.length) throw new Error('No items returned');
  
  // Normalize and return items
  return normalizeMenuItems(items);
}

// Fetch menu from Google Sheet with small cache + background refresh
async function fetchMenu(forceBackground = false) {
  const cacheKey = 'massimo_menu_cache';
  const ttl = 5 * 60 * 1000; // 5 minutes
  const now = Date.now();

  try {
    // Check cache
    const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
    if (cached && now - cached.timestamp < ttl && !forceBackground) {
      console.log('🟢 Cargando menú desde cache');
      state.items = cached.data;
      renderCategories();
      renderProducts();
      updateCartUI();

      // Background refresh if cache is old
      if (now - cached.timestamp > ttl * 0.8) fetchMenu(true);
      return;
    }

    // Fetch from API
    const res = await fetch(CONFIG.WEB_APP_URL);
    const data = await res.json();
    if (!Array.isArray(data)) throw new Error('Formato inválido');

    state.items = data.map(item => ({
      sku: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `sku-${Math.random().toString(36).slice(2,9)}`,
      category: item.category || 'Uncategorized',
      name: item.name || item.title || '',
      description: item.ingredients || item.description || '',
      price: parseFloat(item.price) || 0,
      available: item.available === true || String(item.available).toUpperCase() === 'TRUE'
    }));

    // Save cache
    localStorage.setItem(cacheKey, JSON.stringify({ data: state.items, timestamp: now }));
  // Update last-updated label
  try{ updateLastUpdatedLabel(now); }catch(e){}

  renderCategories();
  renderProducts();
  updateCartUI();
  showToast('Menú actualizado ✅');
  } catch (err) {
    console.error('Error al cargar menú:', err);
    showToast('⚠️ No se pudo actualizar el menú. Usando datos locales.');
    // keep existing state.items (fallback)
  }
}

// small helper to safely parse JSON-ish fields (non-fatal)
function JSONparseSafe(str){ try{ return JSON.parse(str); }catch(e){ return []; } }


function announceToScreenReader(message) { const announcer = document.getElementById('sr-announcements'); if (announcer) { announcer.textContent = message; setTimeout(()=>announcer.textContent='',1000); } }

function showToast(message) { const toast = document.getElementById('toast'); if (!toast) return; toast.textContent = message; toast.classList.add('show'); announceToScreenReader(message); setTimeout(()=>toast.classList.remove('show'),3000); }

// Last-updated UI
function updateLastUpdatedLabel(timestamp){
  const el = document.getElementById('last-updated');
  if(!el) return;
  if(!timestamp){ el.textContent = 'Última actualización: —'; return; }
  const diff = Date.now() - timestamp;
  const mins = Math.floor(diff / 60000);
  if(mins < 1) el.textContent = 'Última actualización: hace unos segundos';
  else if(mins === 1) el.textContent = 'Última actualización: hace 1 minuto';
  else el.textContent = `Última actualización: hace ${mins} minutos`;
}

// Cart helpers (index/sku tolerant)
function saveCart() { try { localStorage.setItem('massimos_cart_v1', JSON.stringify(state.cart)); updateCartUI(); } catch(e){ console.warn('Cart save failed',e); } }

function addToCart(product, options = []) { const existing = state.cart.find(item => item.sku === product.sku && JSON.stringify(item.options||[])===JSON.stringify(options)); if (existing) existing.qty +=1; else state.cart.push({ sku:product.sku, name:product.name, price:product.price, qty:1, notes:'', category:product.category, options }); saveCart(); showToast('Añadido al carrito'); announceToScreenReader(`${product.name} añadido al carrito`); }

function updateQty(identifier, newQty) {
    if (typeof identifier === 'number') {
        const idx = identifier;
        const item = state.cart[idx]; if(!item) return; if(newQty<=0){ removeItem(idx); return;} item.qty=newQty; saveCart(); return; }
    const sku=identifier; if(newQty<=0){ removeItem(sku); return; } const item=state.cart.find(i=>i.sku===sku); if(item){ item.qty=newQty; saveCart(); }
}
function setNotes(identifier, notes){ if(typeof identifier==='number'){ if(state.cart[identifier]){ state.cart[identifier].notes=notes; saveCart(); } return; } const item=state.cart.find(i=>i.sku===identifier); if(item){ item.notes=notes; saveCart(); } }
function removeItem(identifier){ if(typeof identifier==='number'){ const idx=identifier; if(state.cart[idx]){ state.cart.splice(idx,1); saveCart(); } return; } const sku=identifier; state.cart=state.cart.filter(i=>i.sku!==sku); saveCart(); }
function clearCart(){ state.cart=[]; saveCart(); }
function cartTotal(){ return state.cart.reduce((t,i)=>t+(i.price*i.qty),0); }

function updateCartUI(){ const count = state.cart.reduce((t,i)=>t+i.qty,0); const el=document.getElementById('cart-count'); if(el) el.textContent=count; const mobile=document.getElementById('mobile-cart-count'); if(mobile) mobile.textContent=count; const cartContent=document.getElementById('cart-content'); const cartFooter=document.getElementById('cart-footer'); const cartEmpty=document.getElementById('cart-empty'); if(!cartContent||!cartFooter||!cartEmpty) return; if(state.cart.length===0){ cartEmpty.style.display='block'; cartFooter.style.display='none'; cartEmpty.innerHTML=`<div style="font-size:48px;color:var(--neutral);margin-bottom:20px;">🛒</div><p>Your cart is empty</p>`; } else { cartEmpty.style.display='none'; cartFooter.style.display='block'; cartContent.innerHTML = state.cart.map((item,index)=>{ let displayName=item.name; if(item.options && item.options.length>0) displayName+=` (${item.options.map(o=>o.name).join(', ')})`; return `<div class="cart-item"><div class="cart-item-header"><div class="cart-item-name">${esc(displayName)}</div><div class="cart-item-price">${formatPrice(item.price)}</div></div><div class="cart-item-controls"><div class="qty-controls"><button class="qty-btn" data-index="${index}" data-action="decrease">-</button><span class="qty-display">${item.qty}</span><button class="qty-btn" data-index="${index}" data-action="increase">+</button></div><button class="remove-item" data-index="${index}" data-action="remove">Remove</button></div><textarea class="cart-notes" placeholder="Product notes" data-index="${index}">${esc(item.notes)}</textarea></div>` }).join(''); document.getElementById('total-amount').textContent = formatPrice(cartTotal()); } }

// Renderers (similar to original)
function renderProducts(){ const container=document.getElementById('products-container'); if(!container) return; let filtered=state.items.filter(i=>i.available); if(state.filters.category!=='all') filtered=filtered.filter(i=>i.category===state.filters.category); if(state.filters.q){ const q=state.filters.q.toLowerCase(); filtered=filtered.filter(i=>i.name.toLowerCase().includes(q)||i.description.toLowerCase().includes(q)); } if(filtered.length===0){ container.innerHTML=`<div style="text-align:center;padding:50px;color:#666"><div style="font-size:48px;margin-bottom:20px;">🔍</div><p>No products found</p></div>`; return; } container.innerHTML=`<div class="products-grid">${filtered.map(item=>{ let card='product-card'; if(item.category==='Homemade Dish') card+=' homemade'; if(item.category==='Dessert') card+=' dessert'; const hasCustomization = (item.variants && item.variants.length>0)||(item.extras && item.extras.length>0); const buttonText = hasCustomization ? 'Customize' : 'Add'; const buttonAction = hasCustomization ? 'customize' : 'add-to-cart'; return `<div class="${card}">${!item.available?`<div class="unavailable-badge">Unavailable</div>`:''}<h3 class="product-name">${esc(item.name)}</h3><p class="product-description">${esc(item.description)}</p><div class="product-footer"><div class="product-price">${formatPrice(item.price)}</div><button class="add-btn" data-sku="${esc(item.sku)}" data-action="${buttonAction}" ${!item.available?'disabled':''}>${buttonText}</button></div></div>` }).join('')}</div>`; }
function renderProducts() {
  const container = document.getElementById('products-container');
  if (!container) return;
  let filtered = state.items.filter(i => i.available);
  if (state.filters.category !== 'all') filtered = filtered.filter(i => i.category === state.filters.category);
  if (state.filters.q) {
    const q = state.filters.q.toLowerCase();
    filtered = filtered.filter(i => i.name.toLowerCase().includes(q) || i.description.toLowerCase().includes(q));
  }
  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state fade-in"><div class="empty-state-icon">🔍</div><div>No products found</div></div>`;
    return;
  }
  container.innerHTML = `<div class="products-grid">${filtered.map(item => {
    let card = 'product-card fade-in';
    if (item.category === 'Homemade Dish') card += ' homemade';
    if (item.category === 'Dessert') card += ' dessert';
    const hasCustomization = (item.variants && item.variants.length > 0) || (item.extras && item.extras.length > 0);
    const buttonText = hasCustomization ? 'Customize' : 'Add';
    const buttonAction = hasCustomization ? 'customize' : 'add-to-cart';
    return `<div class="${card}">${!item.available ? `<div class="unavailable-badge">Unavailable</div>` : ''}<h3 class="product-name">${esc(item.name)}</h3><p class="product-description">${esc(item.description)}</p><div class="product-footer"><div class="product-price">${formatPrice(item.price)}</div><button class="add-btn" data-sku="${esc(item.sku)}" data-action="${buttonAction}" ${!item.available ? 'disabled' : ''}>${buttonText}</button></div></div>`
  }).join('')}</div>`;
}

function renderCategories(){ const container=document.getElementById('categories-list'); if(!container) return; const allChip=`<div class="category-chip ${state.filters.category==='all'?'active':''}" data-category="all">All</div>`; const chips = state.categories.map(c=>`<div class="category-chip ${state.filters.category===c?'active':''}" data-category="${esc(c)}">${esc(c)}</div>`).join(''); container.innerHTML = allChip + chips; }

// Customization modal functions (kept minimal for clarity)
let currentCustomizingProduct=null; let selectedVariant=null; let selectedExtras=[];
function showCustomizeModal(product){ currentCustomizingProduct=product; selectedVariant=product.variants?product.variants[0]:null; selectedExtras=[]; const modal=document.getElementById('customize-modal'); const title=document.getElementById('customize-title'); const variantsSection=document.getElementById('customize-variants'); const extrasSection=document.getElementById('customize-extras'); const variantsList=document.getElementById('variants-list'); const extrasList=document.getElementById('extras-list'); const notes=document.getElementById('customize-notes'); if(!modal) return; title.textContent=`Customize ${product.name}`; notes.value=''; if(product.variants && product.variants.length>0){ variantsSection.style.display='block'; variantsList.innerHTML=product.variants.map((v,i)=>`<div class="variant-option ${i===0?'selected':''}" data-variant-index="${i}"><div class="variant-info"><div class="variant-radio"></div><span>${esc(v.name)}</span></div><div class="variant-price">${v.price>0?'+'+formatPrice(v.price):'Base'}</div></div>`).join(''); } else variantsSection.style.display='none'; if(product.extras && product.extras.length>0){ extrasSection.style.display='block'; extrasList.innerHTML=product.extras.map((ex,i)=>`<div class="extra-option" data-extra-index="${i}"><div class="extra-info"><div class="extra-checkbox"></div><span>${esc(ex.name)}</span></div><div class="extra-price">+${formatPrice(ex.price)}</div></div>`).join(''); } else extrasSection.style.display='none'; updateCustomizeTotal(); modal.classList.add('active'); trapFocus(modal.querySelector('.customize-content')); announceToScreenReader('Customization modal opened'); }
function closeCustomize(){ document.getElementById('customize-modal').classList.remove('active'); currentCustomizingProduct=null; selectedVariant=null; selectedExtras=[]; if(lastFocusedElement){ lastFocusedElement.focus(); lastFocusedElement=null;} announceToScreenReader('Customization modal closed'); }
function updateCustomizeTotal(){ if(!currentCustomizingProduct) return; let total=currentCustomizingProduct.price; if(selectedVariant) total+=selectedVariant.price; selectedExtras.forEach(e=>total+=e.price); document.getElementById('customize-total').textContent = formatPrice(total); }
function addCustomizedItem(){ if(!currentCustomizingProduct) return; const options=[]; if(selectedVariant && selectedVariant.price>0) options.push(selectedVariant); options.push(...selectedExtras); const notes=document.getElementById('customize-notes').value; addToCart(currentCustomizingProduct, options); if(notes.trim()){ const lastIndex=state.cart.length-1; setNotes(lastIndex, notes); } closeCustomize(); }

// Summary modal
function showOrderSummary(){ if(state.cart.length===0){ showToast('El carrito está vacío'); return;} const modal=document.getElementById('summary-modal'); const itemsContainer=document.getElementById('summary-items'); const totalAmount=document.getElementById('summary-total-amount'); itemsContainer.innerHTML = state.cart.map(item=>{ let displayName=item.name; if(item.options && item.options.length>0) displayName+=` (${item.options.map(o=>o.name).join(', ')})`; return `<div class="summary-item"><div class="summary-item-info"><div class="summary-item-name">${esc(displayName)}</div><div class="summary-item-qty">Qty: ${item.qty} × ${formatPrice(item.price)}</div>${item.notes?`<div class="summary-item-notes">${esc(item.notes)}</div>`:''}</div><div class="summary-item-price">${formatPrice(item.price*item.qty)}</div></div>` }).join(''); totalAmount.textContent = formatPrice(cartTotal()); modal.classList.add('active'); trapFocus(modal.querySelector('.summary-content')); announceToScreenReader('Order Summary opened'); }
function closeSummary(){ document.getElementById('summary-modal').classList.remove('active'); if(lastFocusedElement){ lastFocusedElement.focus(); lastFocusedElement=null;} announceToScreenReader('Order Summary closed'); }

function sendPreOrder(){ if(state.cart.length===0){ showToast('El carrito está vacío'); return; } if(!confirm('¿Enviar pedido a WhatsApp de Massimo?')) return; const restaurantName=CONFIG.STORE_NAME; const whatsappNumber=CONFIG.WHATSAPP; const location=CONFIG.STORE_LOCATION; let message=`🍕 *Nuevo Pedido - ${restaurantName}*\n`; message+=`📍 ${location}\n`; message+=`---------------------------\n\n`; message+=`*PEDIDO:*\n`; state.cart.forEach(item=>{ let displayName=item.name; if(item.options && item.options.length>0) displayName+=` (${item.options.map(o=>o.name).join(', ')})`; message+=`• ${item.qty}x ${displayName} — ${formatPrice(item.price*item.qty)}\n`; if(item.notes && item.notes.trim()) message+=`   ↳ Nota: ${item.notes.trim()}\n`; }); message+=`\n*TOTAL: ${formatPrice(cartTotal())}*\n`; message+=`---------------------------\n\n`; message+=`💬 Por favor, confirma disponibilidad y tiempo de preparación.\n`; message+=`🌐 Pedido realizado desde: ${CONFIG.SITE_URL}`; const whatsappUrl = `https://wa.me/${whatsappNumber.replace(/[^0-9]/g,'')}?text=${encodeURIComponent(message)}`; window.open(whatsappUrl,'_blank','noopener,noreferrer'); if(confirm('¿Quieres limpiar el carrito después de enviar el pedido?')){ clearCart(); showToast('Carrito limpiado - Pedido enviado'); } }

// Focus management and interactions
let lastFocusedElement=null; function trapFocus(element){ if(!element) return; const focusable = element.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'); const first=focusable[0]; const last=focusable[focusable.length-1]; element.addEventListener('keydown',(e)=>{ if(e.key==='Tab'){ if(e.shiftKey){ if(document.activeElement===first){ e.preventDefault(); last.focus(); } } else { if(document.activeElement===last){ e.preventDefault(); first.focus(); } } } if(e.key==='Escape'){ if(element.id==='cart-sidebar') closeCart(); if(element.id==='summary-modal') closeSummary(); } }); first?.focus(); }

// Global event handlers (delegation)
function handleGlobalClick(e){ const target=e.target; const actionEl = target.closest('[data-action], .category-chip, .variant-option, .extra-option'); if(!actionEl) return; if(actionEl.classList.contains('category-chip')){ const category=actionEl.dataset.category; setCategory(category); return; } if(actionEl.dataset.action==='add-to-cart'){ const sku=actionEl.dataset.sku; const product=state.items.find(i=>i.sku===sku); if(product){ actionEl.classList.add('adding'); setTimeout(()=>{ actionEl.classList.remove('adding'); actionEl.classList.add('added'); setTimeout(()=>actionEl.classList.remove('added'),1000); },200); addToCart(product); } return; } if(actionEl.dataset.action==='customize'){ const sku=actionEl.dataset.sku; const product=state.items.find(i=>i.sku===sku); if(product){ lastFocusedElement=actionEl; showCustomizeModal(product); } return; } if(actionEl.classList.contains('variant-option')){ const vi=parseInt(actionEl.dataset.variantIndex); if(currentCustomizingProduct && currentCustomizingProduct.variants){ document.querySelectorAll('.variant-option').forEach(o=>o.classList.remove('selected')); actionEl.classList.add('selected'); selectedVariant=currentCustomizingProduct.variants[vi]; updateCustomizeTotal(); } return; } if(actionEl.classList.contains('extra-option')){ const ei=parseInt(actionEl.dataset.extraIndex); if(currentCustomizingProduct && currentCustomizingProduct.extras){ const extra=currentCustomizingProduct.extras[ei]; const sel=actionEl.classList.contains('selected'); if(sel){ actionEl.classList.remove('selected'); selectedExtras=selectedExtras.filter(e=>e.name!==extra.name); } else { actionEl.classList.add('selected'); selectedExtras.push(extra); } updateCustomizeTotal(); } return; } if(actionEl.dataset.action==='increase'){ const idx=parseInt(actionEl.dataset.index); if(Number.isFinite(idx) && state.cart[idx]) updateQty(idx, state.cart[idx].qty+1); return; } if(actionEl.dataset.action==='decrease'){ const idx=parseInt(actionEl.dataset.index); if(Number.isFinite(idx) && state.cart[idx]) updateQty(idx, state.cart[idx].qty-1); return; } if(actionEl.dataset.action==='remove'){ const idx=parseInt(actionEl.dataset.index); if(Number.isFinite(idx)) removeItem(idx); return; } }

function handleGlobalChange(e){ const target=e.target; if(target.classList.contains('cart-notes')){ const idx=parseInt(target.dataset.index); clearTimeout(target.notesTimeout); target.notesTimeout=setTimeout(()=>{ setNotes(idx, target.value); },500); } }

// Toggle cart UI
function toggleCart(){ lastFocusedElement=document.activeElement; const overlay=document.getElementById('cart-overlay'); const sidebar=document.getElementById('cart-sidebar'); if(window.innerWidth<=768){ sidebar.style.transition='transform 0.3s ease'; sidebar.style.transform = sidebar.classList.contains('active') ? 'translateX(100%)' : 'translateX(0)'; } overlay.classList.toggle('active'); sidebar.classList.toggle('active'); trapFocus(sidebar); announceToScreenReader('Cart ' + (sidebar.classList.contains('active') ? 'opened' : 'closed')); }
function closeCart(){ const overlay=document.getElementById('cart-overlay'); const sidebar=document.getElementById('cart-sidebar'); overlay.classList.remove('active'); sidebar.classList.remove('active'); if(lastFocusedElement){ lastFocusedElement.focus(); lastFocusedElement=null; } announceToScreenReader('Cart closed'); }

// Init
async function initApp(){
  if(window.self!==window.top) document.body.classList.add('embedded-frame');

  // Ensure menu is loaded before wiring interactions
  await fetchMenu();

  window.addEventListener('storage',(e)=>{ if(e.key==='massimos_cart_v1'){ state.cart=JSON.parse(e.newValue||'[]'); updateCartUI(); } });
  function setVH(){ document.body.style.setProperty('--vh', `${window.innerHeight*0.01}px`); }
  setVH(); window.addEventListener('resize', setVH); window.addEventListener('beforeunload', saveCart);

  // Ensure categories are derived from the loaded items
  state.categories=[...new Set(state.items.map(i=>i.category))];

  // Show last-updated from cache if available
  try{
    const cached = JSON.parse(localStorage.getItem('massimo_menu_cache')||'null');
    if(cached && cached.timestamp) updateLastUpdatedLabel(cached.timestamp);
  }catch(e){}

  // Refresh the 'last-updated' label every minute
  setInterval(()=>{
    try{ const cached = JSON.parse(localStorage.getItem('massimo_menu_cache')||'null'); updateLastUpdatedLabel(cached && cached.timestamp); }catch(e){}
  }, 60 * 1000);

  const debouncedSearch = debounce((q)=>{ state.filters.q=q; renderProducts(); },300);
  const searchInput=document.getElementById('search-input'); if(searchInput) searchInput.addEventListener('input',(e)=>debouncedSearch(e.target.value));
  document.addEventListener('click', handleGlobalClick); document.addEventListener('change', handleGlobalChange);
  const summaryModal=document.getElementById('summary-modal'); if(summaryModal) summaryModal.addEventListener('click',(e)=>{ if(e.target===summaryModal) closeSummary(); });
  const customizeModal=document.getElementById('customize-modal'); if(customizeModal) customizeModal.addEventListener('click',(e)=>{ if(e.target===customizeModal) closeCustomize(); });
  const logo=document.getElementById('main-logo'); if(logo) logo.addEventListener('click', ()=>window.scrollTo({top:0, behavior:'smooth'}));
  const cartBtn=document.getElementById('open-cart'); if(cartBtn) cartBtn.addEventListener('click', toggleCart);
  const cartOverlay=document.getElementById('cart-overlay'); if(cartOverlay) cartOverlay.addEventListener('click', closeCart);
  const closeCartBtn=document.querySelector('.close-cart'); if(closeCartBtn) closeCartBtn.addEventListener('click', closeCart);
  const closeSummaryBtn=document.querySelector('.close-summary'); if(closeSummaryBtn) closeSummaryBtn.addEventListener('click', closeSummary);
  const closeCustomizeBtn=document.querySelector('.close-customize'); if(closeCustomizeBtn) closeCustomizeBtn.addEventListener('click', closeCustomize);
  const clearBtn=document.getElementById('clear-btn'); if(clearBtn) clearBtn.addEventListener('click', clearCart);
  const summaryBtn=document.getElementById('summary-btn'); if(summaryBtn) summaryBtn.addEventListener('click', showOrderSummary);
  const preorderBtn=document.getElementById('preorder-btn'); if(preorderBtn) preorderBtn.addEventListener('click', sendPreOrder);
}

// Small helper to load partials
async function loadPartial(path, containerSelector){ try{ const res=await fetch(path); if(!res.ok) throw new Error('Failed to load '+path); const html=await res.text(); document.querySelector(containerSelector).innerHTML = html; } catch(e){ console.error('Partial load error',e); } }

async function bootstrap(){ // load header, menu, footer and then init
    await loadPartial('/partials/header.html','header-placeholder');
    await loadPartial('/partials/menu.html','menu-placeholder');
    await loadPartial('/partials/footer.html','footer-placeholder');
    // Insert modals and utility elements from original page (toast, carts, modals)
    const utilHtml = `
      <div class="cart-overlay" id="cart-overlay" onclick="closeCart()"></div>
      <div class="cart-sidebar" id="cart-sidebar">
        <div class="cart-header">
          <h3 class="cart-title" id="cart-title">Cart</h3><button class="close-cart" onclick="closeCart()" aria-label="Close cart">✕</button>
        </div>
        <div class="cart-content" id="cart-content">
          <div class="cart-empty" id="cart-empty"><div style="font-size:48px;color:var(--neutral);margin-bottom:20px;">🛒</div><p>Your cart is empty</p></div>
        </div>
        <div class="cart-footer" id="cart-footer" style="display:none;">
          <div class="cart-total"><span class="total-label" id="total-label">Subtotal:</span><span class="total-amount" id="total-amount">0,00 €</span></div>
          <div class="cart-actions"><button class="clear-cart" onclick="clearCart()" id="clear-btn">Clear cart</button>
            <div class="order-actions"><button class="summary-btn" onclick="showOrderSummary()" id="summary-btn"> 📋 View Order Summary </button><button class="preorder-btn" onclick="sendPreOrder()" id="preorder-btn"> 📱 Make Pre-Order via WhatsApp </button></div>
          </div>
        </div>
      </div>

      <div class="customize-modal" id="customize-modal">
        <div class="customize-content">
          <div class="customize-header">
            <h3 class="customize-title" id="customize-title">Customize Your Order</h3><button class="close-customize" onclick="closeCustomize()">✕</button>
          </div>
          <div id="customize-variants" class="customize-section" style="display:none;"></div>
          <div id="customize-extras" class="customize-section" style="display:none;"></div>
          <div class="customize-section"><h4>Special Instructions</h4><textarea class="customize-notes" id="customize-notes" placeholder="Any special requests or modifications..."></textarea></div>
          <div class="customize-footer"><div class="customize-total" id="customize-total">€0.00</div><button class="add-custom-btn" id="add-custom-btn" onclick="addCustomizedItem()"> Add to Cart </button></div>
        </div>
      </div>

      <div class="summary-modal" id="summary-modal">
        <div class="summary-content">
          <div class="summary-header"><h3 class="summary-title" id="summary-modal-title">Order Summary</h3><button class="close-summary" onclick="closeSummary()">✕</button></div>
          <div id="summary-items"></div>
          <div class="summary-total"><span class="summary-total-label" id="summary-total-label">Total:</span><span class="summary-total-amount" id="summary-total-amount">0,00 €</span></div>
          <div class="summary-instructions"><h4 id="summary-instructions-title">How to use this summary?</h4><p id="summary-instructions-text">You can use this summary to place your order in person with Massimo, or make a pre-order via WhatsApp for pickup or delivery.</p></div>
          <button class="summary-btn" onclick="sendPreOrder()" style="margin-top:20px;">✓ Confirm Order</button>
        </div>
      </div>

      <div class="toast" id="toast" role="status" aria-live="polite" aria-atomic="true"></div>
      <div id="sr-announcements" class="sr-only" aria-live="polite" aria-atomic="true"></div>
    `;
    document.getElementById('utils-placeholder').innerHTML = utilHtml;

    // Important: attach global functions to window so inline handlers (onclick attributes) work for now
    window.toggleCart = toggleCart; window.closeCart = closeCart; window.clearCart = clearCart; window.showOrderSummary = showOrderSummary; window.sendPreOrder = sendPreOrder; window.closeCustomize = closeCustomize; window.addCustomizedItem = addCustomizedItem;

  // Initialize the app (initApp will load the menu first)
  await initApp();

    // Add manual refresh button handler
    const refreshBtn = document.getElementById('refresh-menu-btn');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', async () => {
        refreshBtn.disabled = true;
        refreshBtn.textContent = 'Refreshing...';
        await fetchMenu();
        refreshBtn.disabled = false;
        refreshBtn.textContent = '🔄 Refresh menu';
      });
    }
}

// Start bootstrap when DOM ready
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', bootstrap); else bootstrap();
