let menuItems = [];
let cart = [];
let heldOrders = [];
let holdCounter = 1;
let currentCategory = 'all';

// Indian Currency Formatter
const currencyFormatter = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2
});

async function fetchNextOrderId() {
    try {
        const response = await fetch('/api/orders/next-id');
        const data = await response.json();
        if (data && data.nextId !== undefined) {
            document.getElementById('nextOrderId').textContent = '#' + data.nextId;
        }
    } catch (error) {
        console.error('Error fetching next order ID:', error);
    }
}

async function fetchTodayStats() {
    try {
        const response = await fetch('/api/orders/stats?status=daily');
        const data = await response.json();
        if (data && data.total_orders !== undefined) {
            document.getElementById('todayOrderCount').textContent = data.total_orders;
        }
    } catch (error) {
        console.error('Error fetching today stats:', error);
    }
}

// ── Auth guard ──
const rawUser = sessionStorage.getItem('pos_user');
if (!rawUser) window.location.href = 'pos_login.html';
const sessionUser = JSON.parse(rawUser || '{}');

// Display session user in top-bar
const roleLabels = { staff: 'Cashier', admin: 'Admin' };
document.getElementById('sessionUserName').textContent  = sessionUser.name || '—';
document.getElementById('sessionUserRole').textContent  = roleLabels[sessionUser.role] || '—';

function logout() {
    sessionStorage.removeItem('pos_user');
    window.location.href = 'pos_login.html';
}

// ── Role-based Exit Button ──
const exitBtn = document.getElementById('exitBtn');
if (sessionUser.role === 'staff') {
    exitBtn.style.display = 'none';
} else {
    exitBtn.addEventListener('click', () => {
        window.location.href = 'admin.html';
    });
}

// ── Modal Helpers ──
function showModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.display = 'flex';
    const focusable = el.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (focusable.length) setTimeout(() => focusable[0].focus(), 100);
    setTimeout(() => el.classList.add('show'), 10);
}

function hideModal(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('show');
    setTimeout(() => el.style.display = 'none', 200);
}

// ── Theme & Contrast Toggles ──
document.addEventListener('DOMContentLoaded', () => {
    const themeBtn = document.getElementById('themeToggleBtn');
    if (themeBtn) themeBtn.addEventListener('click', () => document.documentElement.classList.toggle('theme-teal'));
    
    const contrastBtn = document.getElementById('highContrastBtn');
    if (contrastBtn) contrastBtn.addEventListener('click', () => document.documentElement.classList.toggle('high-contrast'));
});

// ── Settings Logic ──
document.getElementById('settingsBtn').addEventListener('click', () => {
    document.getElementById('settingName').value = sessionUser.name || '';
    document.getElementById('settingUsername').value = sessionUser.username || sessionUser.name; // fallback to name if username is missing in old session
    document.getElementById('settingsError').style.display = 'none';
    document.getElementById('settingsSuccess').style.display = 'none';
    document.getElementById('settingPassword').value = '';
    showModal('settingsModal');
});

document.getElementById('settingsForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newName = document.getElementById('settingName').value.trim();
    const newUsername = document.getElementById('settingUsername').value.trim();
    const newPassword = document.getElementById('settingPassword').value;

    try {
        const response = await fetch('/api/users/update', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                currentUsername: sessionUser.username || sessionUser.name,
                newName,
                newUsername,
                newPassword
            })
        });

        const result = await response.json();
        if (result.success) {
            document.getElementById('settingsSuccess').textContent = result.message;
            document.getElementById('settingsSuccess').style.display = 'block';
            document.getElementById('settingsError').style.display = 'none';
            // Update session and UI
            sessionUser.name = newName;
            sessionUser.username = newUsername;
            document.getElementById('sessionUserName').textContent = newName;
            sessionStorage.setItem('pos_user', JSON.stringify(sessionUser));
            setTimeout(() => { hideModal('settingsModal'); }, 1500);
        } else {
            document.getElementById('settingsError').textContent = result.message || 'Update failed.';
            document.getElementById('settingsError').style.display = 'block';
            document.getElementById('settingsSuccess').style.display = 'none';
        }
    } catch (err) {
        document.getElementById('settingsError').textContent = 'Server error.';
        document.getElementById('settingsError').style.display = 'block';
    }
});

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await fetchItems();
    await fetchNextOrderId();
    await fetchTodayStats();
    renderMenu();
    if (typeof renderFavorites === 'function') renderFavorites();
    updateDateTime();
    setInterval(updateDateTime, 60000);

    // Category filtering
    document.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentCategory = btn.dataset.category;
            renderMenu();
        });
    });

    // Toggle categories
    const categoryToggle = document.getElementById('categoryToggle');
    const categoriesNav = document.getElementById('categoriesNav');
    if (categoryToggle && categoriesNav) {
        categoryToggle.addEventListener('click', () => {
            categoriesNav.classList.toggle('collapsed');
            categoryToggle.classList.toggle('collapsed');
        });
    }

    // Search functionality & Autocomplete
    const searchInput = document.getElementById('menuSearch');
    const autoResults = document.getElementById('autocompleteResults');
    let focusedIndex = -1;
    let currentAutoItems = [];

    if (searchInput && autoResults) {
        searchInput.addEventListener('input', (e) => {
            const val = e.target.value.toLowerCase();
            renderMenu(val);
            
            if (!val) {
                autoResults.style.display = 'none';
                return;
            }
            
            currentAutoItems = menuItems.filter(item => item.name.toLowerCase().includes(val)).slice(0, 5);
            if (currentAutoItems.length > 0) {
                autoResults.innerHTML = currentAutoItems.map((item, idx) => `
                    <div class="auto-item" data-idx="${idx}">
                        <span>${escapeHtml(item.name)}</span>
                        <span style="color:var(--muted)">${currencyFormatter.format(item.price)}</span>
                    </div>
                `).join('');
                autoResults.style.display = 'block';
                focusedIndex = -1;
            } else {
                autoResults.style.display = 'none';
            }
        });

        searchInput.addEventListener('keydown', (e) => {
            if (autoResults.style.display === 'none') return;
            const items = autoResults.querySelectorAll('.auto-item');
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                focusedIndex = (focusedIndex + 1) % items.length;
                updateFocus();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                focusedIndex = (focusedIndex - 1 + items.length) % items.length;
                updateFocus();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (focusedIndex >= 0 && currentAutoItems[focusedIndex]) {
                    handleItemClick(currentAutoItems[focusedIndex]);
                    searchInput.value = '';
                    renderMenu('');
                    autoResults.style.display = 'none';
                }
            }
            function updateFocus() {
                items.forEach((item, idx) => {
                    if (idx === focusedIndex) item.style.background = 'var(--bg3)';
                    else item.style.background = '';
                });
            }
        });

        autoResults.addEventListener('click', (e) => {
            const itemEl = e.target.closest('.auto-item');
            if (itemEl) {
                const idx = itemEl.dataset.idx;
                handleItemClick(currentAutoItems[idx]);
                searchInput.value = '';
                renderMenu('');
                autoResults.style.display = 'none';
            }
        });
        
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container')) {
                autoResults.style.display = 'none';
            }
        });
    }

    // Clear cart
    document.getElementById('clearBtn').addEventListener('click', () => {
        cart = [];
        renderCart();
    });

    // KOT
    document.getElementById('kotBtn').addEventListener('click', () => {
        openKotModal();
    });

    // Hold Order
    document.getElementById('holdBtn').addEventListener('click', () => {
        if (cart.length === 0) return;
        const holdName = prompt('Enter name for hold order:', '') || 'Guest';
        heldOrders.push({ id: holdCounter++, name: holdName, cart: [...cart], heldAt: new Date() });
        cart = [];
        renderCart();
        renderHeldOrders();
    });

    // Payment method toggle
    document.querySelectorAll('.pay-method').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.pay-method').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Pay button
    document.getElementById('payBtn').addEventListener('click', () => {
        if (cart.length === 0) return;
        
        const isCard = document.querySelector('.pay-method.active').textContent.includes('Card');
        if (isCard) {
            showModal('cardConfirmModal');
        } else {
            openCashModal();
        }
    });

    // Card Confirm
    document.getElementById('confirmCardPaymentBtn').addEventListener('click', async () => {
        hideModal('cardConfirmModal');
        await saveOrder();
    });

    // KOT modal buttons
    const connectBtn = document.getElementById('connectKotPrinterBtn');
    const testBtn = document.getElementById('testKotPrinterBtn');
    const printBtn = document.getElementById('printKotBtn');
    if (connectBtn) connectBtn.addEventListener('click', connectKotPrinter);
    if (testBtn) testBtn.addEventListener('click', () => kotPrintText(buildTestKot()));
    if (printBtn) printBtn.addEventListener('click', () => {
        if (!cart.length) return alert('Cart is empty.');
        kotPrintText(buildKotFromCart(cart));
    });
});

async function fetchItems() {
    try {
        const response = await fetch('/api/items');
        menuItems = await response.json();
    } catch (error) {
        console.error('Error fetching items:', error);
        // Fallback to empty if server is down, or alert user
    }
}

// ──────────────────────────────────────────
// KOT (Kitchen Order Ticket) via Web Bluetooth
// ──────────────────────────────────────────
let kotBleDevice = null;
let kotBleCharacteristic = null;

function openKotModal() {
    showModal('kotModal');
    const svc = document.getElementById('kotServiceUuid');
    const chr = document.getElementById('kotCharUuid');
    svc.value = localStorage.getItem('kot_service_uuid') || 'FFE0';
    chr.value = localStorage.getItem('kot_char_uuid') || 'FFE1';
    setKotStatus(kotBleCharacteristic ? 'Printer connected.' : 'Not connected.');
    setKotError('');
    lucide.createIcons();
}

function setKotStatus(msg) {
    const el = document.getElementById('kotStatus');
    if (!el) return;
    el.textContent = msg || '';
    el.style.display = msg ? 'block' : 'none';
}

function setKotError(msg) {
    const el = document.getElementById('kotError');
    if (!el) return;
    el.textContent = msg || '';
    el.style.display = msg ? 'block' : 'none';
}

function normalizeUuid(input) {
    const v = String(input || '').trim();
    if (!v) return null;
    // Accept "FFE0" and convert to 0xFFE0 style UUID for Web Bluetooth
    if (/^[0-9a-fA-F]{4}$/.test(v)) return `0000${v.toLowerCase()}-0000-1000-8000-00805f9b34fb`;
    return v;
}

async function connectKotPrinter() {
    try {
        setKotError('');
        if (!navigator.bluetooth) {
            throw new Error('Web Bluetooth not supported in this browser. Use Chrome/Edge on desktop.');
        }

        const serviceUuidRaw = document.getElementById('kotServiceUuid').value;
        const charUuidRaw = document.getElementById('kotCharUuid').value;
        const serviceUuid = normalizeUuid(serviceUuidRaw);
        const charUuid = normalizeUuid(charUuidRaw);
        if (!serviceUuid || !charUuid) throw new Error('Please enter service/characteristic UUIDs.');

        localStorage.setItem('kot_service_uuid', serviceUuidRaw.trim());
        localStorage.setItem('kot_char_uuid', charUuidRaw.trim());

        setKotStatus('Select your printer…');
        const device = await navigator.bluetooth.requestDevice({
            filters: [{ services: [serviceUuid] }],
            optionalServices: [serviceUuid],
        });

        kotBleDevice = device;
        kotBleDevice.addEventListener('gattserverdisconnected', () => {
            kotBleCharacteristic = null;
            setKotStatus('Printer disconnected.');
        });

        setKotStatus('Connecting…');
        const server = await device.gatt.connect();
        const service = await server.getPrimaryService(serviceUuid);
        const characteristic = await service.getCharacteristic(charUuid);

        kotBleCharacteristic = characteristic;
        setKotStatus(`Connected to: ${device.name || 'BLE Printer'}`);
    } catch (err) {
        console.error(err);
        setKotError(err.message || 'Failed to connect.');
        setKotStatus('');
    }
}

function buildKotFromCart(cartItems) {
    const ts = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    const lines = [];
    lines.push('KOT');
    lines.push('------------------------------');
    lines.push(`Time: ${ts}`);
    lines.push(`Cashier: ${sessionUser.name || '—'}`);
    lines.push('------------------------------');

    cartItems.forEach(item => {
        const qty = item.quantity || 1;
        const label = item.variant ? `${item.name} (${item.variant})` : item.name;
        lines.push(`${qty} x ${label}`);
    });

    lines.push('------------------------------');
    lines.push('\n\n');
    return lines.join('\n');
}

function buildTestKot() {
    return ['KOT TEST', '------------------------------', 'Bluetooth OK', '\n\n'].join('\n');
}

async function kotPrintText(text) {
    try {
        setKotError('');
        if (!kotBleCharacteristic) throw new Error('Printer not connected. Click “Connect Printer”.');
        setKotStatus('Printing…');

        // ESC/POS init + text + cut (cut may be ignored by some BLE printers)
        const payload = escposEncode(text, true);
        await bleWriteInChunks(kotBleCharacteristic, payload, 180);

        setKotStatus('Printed.');
    } catch (err) {
        console.error(err);
        setKotError(err.message || 'Print failed.');
        setKotStatus('');
    }
}

function escposEncode(text, doCut) {
    const encoder = new TextEncoder();
    const init = new Uint8Array([0x1B, 0x40]); // ESC @
    const body = encoder.encode(String(text || ''));
    const cut = doCut ? new Uint8Array([0x1D, 0x56, 0x41, 0x10]) : new Uint8Array([]);
    const out = new Uint8Array(init.length + body.length + cut.length);
    out.set(init, 0);
    out.set(body, init.length);
    out.set(cut, init.length + body.length);
    return out;
}

async function bleWriteInChunks(characteristic, bytes, chunkSize) {
    const max = chunkSize || 180;
    for (let i = 0; i < bytes.length; i += max) {
        const chunk = bytes.slice(i, i + max);
        await characteristic.writeValueWithoutResponse(chunk);
        await new Promise(r => setTimeout(r, 30));
    }
}

async function saveOrder() {
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const orderData = {
        subtotal,
        total: subtotal,
        cashier_name: sessionUser.name || 'Unknown',
        items: cart.map(item => ({
            id: item.id,
            quantity: item.quantity,
            price: item.price
        }))
    };

    try {
        const response = await fetch('/api/orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(orderData)
        });

        const result = await response.json();
        if (result.success) {
            showModal('successModal');
            document.getElementById('successOrderMsg').textContent = `Order #${result.orderId} has been processed.`;
            // Sync stats
            fetchNextOrderId();
            fetchTodayStats();
        }
    } catch (error) {
        console.error('Error saving order:', error);
        alert('Failed to save order. Please check if the server is running.');
    }
}

function renderMenu(searchTerm = '') {
    const grid = document.getElementById('menuGrid');
    grid.innerHTML = '';

    const filtered = menuItems.filter(item => {
        const matchesCategory = currentCategory === 'all' || item.category === currentCategory;
        const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesCategory && matchesSearch;
    });

    const parseVariantFromName = (name) => {
        const m = String(name || '').match(/^(.*)\s+\(([^)]+)\)\s*$/);
        if (!m) return { baseName: String(name || ''), variantLabel: null };
        return { baseName: m[1].trim(), variantLabel: m[2].trim() };
    };

    const groups = new Map(); // key -> { baseName, category, items: [] }
    for (const item of filtered) {
        const { baseName, variantLabel } = parseVariantFromName(item.name);
        const key = `${item.category}::${baseName}`.toLowerCase();
        if (!groups.has(key)) groups.set(key, { baseName, category: item.category, items: [] });
        groups.get(key).items.push({ ...item, _baseName: baseName, _variantLabel: variantLabel });
    }

    Array.from(groups.values()).forEach(group => {
        const items = group.items.slice().sort((a, b) => {
            // Prefer ordering by numeric size if present ("4 pcs", "6 pcs", etc.)
            const na = Number((a._variantLabel || '').match(/(\d+)/)?.[1] || NaN);
            const nb = Number((b._variantLabel || '').match(/(\d+)/)?.[1] || NaN);
            if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
            return String(a._variantLabel || '').localeCompare(String(b._variantLabel || ''));
        });

        const card = document.createElement('div');
        card.className = 'item-card list-item';

        if (items.length > 1 && items.every(i => i._variantLabel)) {
            const first = items[0];
            card.classList.add('item-card-variant');
            card.innerHTML = `
                <div class="item-info">
                    <div class="item-name">${escapeHtml(group.baseName)}</div>
                    <div class="item-price-group">
                        <span class="item-price" data-role="variantPrice">${currencyFormatter.format(first.price)}</span>
                    </div>
                </div>
                <div class="item-variant-row">
                    <select class="item-variant-select" data-role="variantSelect" aria-label="Choose size">
                        ${items.map((it, idx) => `<option value="${idx}">${escapeHtml(it._variantLabel)} — ${currencyFormatter.format(it.price)}</option>`).join('')}
                    </select>
                    <button class="item-add-btn" type="button" data-role="variantAdd">Add</button>
                </div>
            `;

            const selectEl = card.querySelector('[data-role="variantSelect"]');
            const priceEl = card.querySelector('[data-role="variantPrice"]');
            const addEl = card.querySelector('[data-role="variantAdd"]');

            const getSelectedItem = () => items[Number(selectEl.value) || 0];

            selectEl.addEventListener('change', () => {
                const it = getSelectedItem();
                priceEl.textContent = currencyFormatter.format(it.price);
            });
            addEl.addEventListener('click', (e) => {
                e.stopPropagation();
                const it = getSelectedItem();
                addToCart({ ...it, chosenPrice: it.price, variant: it._variantLabel, cartKey: `${it.id}_v` });
            });
        } else {
            const item = items[0];
            card.innerHTML = `
                <div class="item-info">
                    <div class="item-name">${escapeHtml(item.name)}</div>
                    <div class="item-price-group">
                        <span class="item-price">${currencyFormatter.format(item.price)}</span>
                        ${item.price_half ? `<span class="item-price-half">&frac12; ${currencyFormatter.format(item.price_half)}</span>` : ''}
                    </div>
                </div>
                <div class="item-add-row">
                    <button class="item-add-btn" type="button" data-role="addBtn">+ Add</button>
                </div>
            `;
            card.querySelector('[data-role="addBtn"]').addEventListener('click', (e) => {
                e.stopPropagation();
                handleItemClick(item);
            });
            card.addEventListener('click', () => handleItemClick(item));
        }

        grid.appendChild(card);
    });
}

function escapeHtml(str) {
    return String(str)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#039;');
}

function handleItemClick(item) {
    if (item.price_half) {
        // Show size picker
        document.getElementById('sizePickerItemName').textContent = item.name;
        document.getElementById('sizePickerFull').textContent = `Full  ${currencyFormatter.format(item.price)}`;
        document.getElementById('sizePickerHalf').textContent = `\u00bd  ${currencyFormatter.format(item.price_half)}`;
        document.getElementById('sizePickerFull').onclick = () => {
            addToCart({ ...item, chosenPrice: item.price, variant: 'Full', cartKey: `${item.id}_full` });
            hideModal('sizePickerModal');
        };
        document.getElementById('sizePickerHalf').onclick = () => {
            addToCart({ ...item, chosenPrice: item.price_half, variant: '\u00bd', cartKey: `${item.id}_half` });
            hideModal('sizePickerModal');
        };
        showModal('sizePickerModal');
    } else {
        addToCart({ ...item, chosenPrice: item.price, cartKey: `${item.id}_full` });
    }
}

function addToCart(item) {
    const key = item.cartKey || `${item.id}_full`;
    const existing = cart.find(i => i.cartKey === key);
    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({ ...item, cartKey: key, price: item.chosenPrice ?? item.price, quantity: 1 });
    }
    renderCart();
}

function removeFromCart(cartKey) {
    const item = cart.find(i => i.cartKey === cartKey);
    if (!item) return;
    if (item.quantity > 1) {
        item.quantity -= 1;
    } else {
        cart = cart.filter(i => i.cartKey !== cartKey);
    }
    renderCart();
}

function renderCart() {
    const cartContainer = document.getElementById('cartItems');
    cartContainer.innerHTML = '';

    if (cart.length === 0) {
        cartContainer.innerHTML = `
            <div class="empty-cart">
                <i data-lucide="shopping-cart"></i>
                <p>No items added yet</p>
            </div>
        `;
        lucide.createIcons();
        updateTotals();
        return;
    }

    cart.forEach(item => {
        const div = document.createElement('div');
        div.className = 'cart-item';
        const variantLabel = item.variant ? ` <span style="font-size:11px;color:#64748b;font-weight:400;">(${item.variant})</span>` : '';
        div.innerHTML = `
            <div class="cart-item-info">
                <h4>${item.name}${variantLabel}</h4>
                <span>${currencyFormatter.format(item.price)} x ${item.quantity}</span>
            </div>
            <div class="cart-item-qty">
                <button class="qty-btn" data-action="remove" data-key="${item.cartKey}">-</button>
                <span>${item.quantity}</span>
                <button class="qty-btn" data-action="add" data-key="${item.cartKey}">+</button>
            </div>
        `;
        div.querySelector('[data-action="remove"]').onclick = () => removeFromCart(item.cartKey);
        div.querySelector('[data-action="add"]').onclick = () => {
            const cartItem = cart.find(i => i.cartKey === item.cartKey);
            if (cartItem) { cartItem.quantity += 1; renderCart(); }
        };
        cartContainer.appendChild(div);
    });

    updateTotals();
}

function updateTotals() {
    const total = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

    document.getElementById('subtotal').textContent = currencyFormatter.format(total);
    document.getElementById('total').textContent = currencyFormatter.format(total);

    const mobileTotalBtn = document.getElementById('mobileCartTotal');
    if (mobileTotalBtn) {
        mobileTotalBtn.textContent = currencyFormatter.format(total);
    }
    const mobileBtn = document.getElementById('mobileViewCartBtn');
    if (mobileBtn) {
        if (itemCount > 0) {
            mobileBtn.style.display = '';
        } else {
            mobileBtn.style.display = 'none';
        }
    }
}

function getOrdinal(n) {
    const s = ["th", "st", "nd", "rd"];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

let holdPressTimer;

function startHoldPress(id) {
    if (holdPressTimer) clearTimeout(holdPressTimer);
    holdPressTimer = setTimeout(() => {
        showHoldPreview(id);
    }, 500); // 500ms for long press
}

function endHoldPress() {
    if (holdPressTimer) clearTimeout(holdPressTimer);
}

function showHoldPreview(id) {
    const order = heldOrders.find(o => o.id === id);
    if (!order) return;
    
    let previewModal = document.getElementById('previewModal');
    if (!previewModal) {
        previewModal = document.createElement('div');
        previewModal.id = 'previewModal';
        previewModal.className = 'modal';
        previewModal.innerHTML = `
          <div class="modal-content">
            <div class="modal-header">
              <h2 id="previewModalTitle" style="font-size:18px;margin:0;">Hold Preview</h2>
              <button class="icon-btn" onclick="document.getElementById('previewModal').style.display='none'" aria-label="Close" style="background:none;border:none;color:var(--muted);"><i data-lucide="x"></i></button>
            </div>
            <div class="modal-body" style="padding:15px 0;">
              <div id="previewModalList" style="max-height:300px;overflow-y:auto;padding:0 15px;"></div>
            </div>
            <div class="modal-footer" style="padding:15px;display:flex;justify-content:center;border-top:1px solid var(--border);">
              <button class="btn btn-secondary" onclick="document.getElementById('previewModal').style.display='none'">Close</button>
            </div>
          </div>
        `;
        document.body.appendChild(previewModal);
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
    
    document.getElementById('previewModalTitle').textContent = `Preview: ${order.name || 'Guest'}`;
    const list = document.getElementById('previewModalList');
    
    list.innerHTML = order.cart.map(item => `
        <div style="display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);">
            <div style="flex:1;">
                <div style="font-weight:600;font-size:14px;">${escapeHtml(item.name)}</div>
                <div style="font-size:12px;color:var(--muted);">${currencyFormatter.format(item.price)} x ${item.quantity}</div>
            </div>
            <div style="font-weight:700;">${currencyFormatter.format(item.price * item.quantity)}</div>
        </div>
    `).join('');
    
    previewModal.style.display = 'flex';
}

function renderHeldOrders() {
    const panel = document.getElementById('heldOrdersPanel');
    const list = document.getElementById('heldOrdersList');

    if (heldOrders.length === 0) {
        panel.style.display = 'none';
        return;
    }

    panel.style.display = 'block';
    list.innerHTML = heldOrders.map((order, idx) => {
        const itemCount = order.cart.reduce((s, i) => s + i.quantity, 0);
        const total = order.cart.reduce((s, i) => s + i.price * i.quantity, 0);
        const timeStr = order.heldAt.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        const position = getOrdinal(idx + 1);
        const orderName = order.name || 'Guest';
        
        return `
            <div class="held-order-pill" 
                 onmousedown="startHoldPress(${order.id})" 
                 ontouchstart="startHoldPress(${order.id})" 
                 onmouseup="endHoldPress()" 
                 ontouchend="endHoldPress()" 
                 onmouseleave="endHoldPress()"
                 ontouchmove="endHoldPress()">
                <div style="flex:1;">
                    <div class="held-order-pill-label" style="pointer-events:none;">${position} — ${escapeHtml(orderName)}</div>
                    <div class="held-order-pill-meta" style="pointer-events:none;">${itemCount} item${itemCount !== 1 ? 's' : ''} · ${currencyFormatter.format(total)} · ${timeStr}</div>
                </div>
                <button class="held-order-pill-resume" onclick="resumeHeldOrder(${order.id}, event)">Resume</button>
            </div>
        `;
    }).join('');
    lucide.createIcons();
}

function resumeHeldOrder(id, event) {
    if (event) event.stopPropagation();
    const idx = heldOrders.findIndex(o => o.id === id);
    if (idx === -1) return;

    // If current cart has items, hold it first
    if (cart.length > 0) {
        const holdName = prompt('Current order not empty. Enter name to hold it:', '') || 'Guest';
        heldOrders.push({ id: holdCounter++, name: holdName, cart: [...cart], heldAt: new Date() });
    }

    cart = heldOrders[idx].cart;
    heldOrders.splice(idx, 1);
    renderCart();
    renderHeldOrders();
}

function updateDateTime() {
    const now = new Date();
    const options = { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' };
    document.getElementById('dateTime').textContent = now.toLocaleDateString('en-US', options).replace(',', ' |');
}

function closeModal() {
    hideModal('successModal');
    cart = [];
    renderCart();
}

// ── Cash Numpad Logic ──
let currentCashReceived = '';
let orderTotalToPay = 0;

function generateNumpad() {
    const numpad = document.querySelector('.numpad');
    if (numpad.children.length > 0) return; // already generated

    const keys = [
        '1', '2', '3',
        '4', '5', '6',
        '7', '8', '9',
        'C', '0', 'DEL'
    ];

    keys.forEach(key => {
        const btn = document.createElement('button');
        btn.className = `numpad-btn ${['C', 'DEL'].includes(key) ? 'numpad-action' : ''}`;
        btn.textContent = key;
        btn.onclick = () => handleNumpad(key);
        numpad.appendChild(btn);
    });
}

function openCashModal() {
    orderTotalToPay = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    
    document.getElementById('cashTotalDue').textContent = currencyFormatter.format(orderTotalToPay);
    currentCashReceived = '';
    updateCashDisplay();
    generateNumpad();
    
    showModal('cashModal');
}

function closeCashModal() {
    hideModal('cashModal');
}

function handleNumpad(key) {
    if (key === 'C') {
        currentCashReceived = '';
    } else if (key === 'DEL') {
        currentCashReceived = currentCashReceived.slice(0, -1);
    } else {
        if (currentCashReceived.length < 8) currentCashReceived += key;
    }
    updateCashDisplay();
}

function updateCashDisplay() {
    const receivedVal = parseFloat(currentCashReceived) || 0;
    document.getElementById('cashReceivedDisplay').textContent = '₹' + receivedVal.toLocaleString('en-IN');
    
    const change = receivedVal - orderTotalToPay;
    document.getElementById('cashChange').textContent = change > 0 ? currencyFormatter.format(change) : '₹0.00';
    
    const confirmBtn = document.getElementById('confirmCashPaymentBtn');
    confirmBtn.disabled = receivedVal < orderTotalToPay;
}

document.getElementById('confirmCashPaymentBtn').addEventListener('click', async () => {
    closeCashModal();
    await saveOrder();
});

function renderFavorites() {
    const favBar = document.getElementById('favoritesBar');
    if (!favBar) return;
    
    // Pick top 6 items as favorites
    const favs = menuItems.slice(0, 6);
    if (favs.length === 0) {
        favBar.style.display = 'none';
        return;
    }
    
    favBar.style.display = 'flex';
    favBar.innerHTML = favs.map(item => `
        <button class="fav-item" onclick='handleFavClick(${JSON.stringify(item)})'>
            ${escapeHtml(item.name)}
        </button>
    `).join('');
}
window.handleFavClick = (item) => handleItemClick(item);

