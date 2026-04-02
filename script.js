import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-analytics.js";
import { getFirestore, collection, addDoc, getDocs, setDoc, deleteDoc, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut, sendPasswordResetEmail, updateProfile } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyAwF0PFcEPajQwFbZ9YJuSCmSrinSHGeqQ",
  authDomain: "cooking-assistant-1bc77.firebaseapp.com",
  projectId: "cooking-assistant-1bc77",
  storageBucket: "cooking-assistant-1bc77.firebasestorage.app",
  messagingSenderId: "732195694271",
  appId: "1:732195694271:web:86d3c21e468d9ee530880a",
  measurementId: "G-2YM0JFERSK"
};

const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const db = getFirestore(app);
const auth = getAuth(app);

// === 状態管理変数 ===
let currentFamilyId = null;
let currentFamilyName = ""; 
let units = ['g', 'ml', '大さじ', '小さじ', '個', '本', 'パック', '袋'];
let foods = []; 
let recipes = [];
let publicRecipes = []; 
let selectedRecipeIds = [];
let inventoryStock = {};
let shoppingChecked = {};

const CATEGORIES = ['肉類', '野菜・果物', '魚介類', '調味料', 'その他'];
let isUnitEditMode = false;
let editingFoodIndex = -1;
let editingRecipeId = null;

// === ① アカウント登録・ログイン・リセット機能 ===
function openRegisterModal() {
    document.getElementById('reg-email').value = '';
    document.getElementById('reg-password').value = '';
    document.getElementById('reg-nickname').value = '';
    document.getElementById('register-modal').classList.remove('hidden');
}

async function registerWithEmail() {
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value.trim();
    const nickname = document.getElementById('reg-nickname').value.trim();
    
    if(!email || !password || !nickname) return alert("メールアドレス、パスワード、表示名(ニックネーム)をすべて入力してください。");
    
    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(userCredential.user, { displayName: nickname });
        alert(`「${nickname}」さん、アカウントを作成しました！`);
        closeModal('register-modal');
    } catch(e) {
        console.error(e);
        alert("登録に失敗しました。パスワードが短すぎるか、すでに登録されている可能性があります。");
    }
}

async function loginWithEmail() {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();
    if(!email || !password) return alert("メールアドレスとパスワードを入力してください。");
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch(e) {
        console.error(e);
        alert("ログインに失敗しました。入力内容を確認してください。");
    }
}

async function resetPassword() {
    const email = document.getElementById('login-email').value.trim();
    if(!email) return alert("パスワードをリセットするには、上段の「メールアドレス」欄に入力してから「パスワードを忘れた場合はこちら」をクリックしてください。");
    
    if(confirm(`${email} 宛にパスワード再設定メールを送信しますか？`)) {
        try {
            await sendPasswordResetEmail(auth, email);
            alert("パスワード再設定メールを送信しました。メールの案内に従ってパスワードを再設定してください。");
        } catch(e) {
            console.error(e);
            alert("メールの送信に失敗しました。アドレスが間違っているか、登録されていない可能性があります。");
        }
    }
}

async function logoutAccount() {
    if(confirm("アカウントからログアウトしますか？")) await signOut(auth);
}

// === ② マイページ（キッチン作成・参加・履歴）機能 ===
function renderKitchenList(kitchens) {
    const listDiv = document.getElementById('existing-kitchen-list');
    listDiv.innerHTML = '';
    
    if (kitchens && kitchens.length > 0) {
        document.getElementById('existing-kitchen-section').classList.remove('hidden');
        kitchens.forEach(k => {
            const btn = document.createElement('button');
            btn.className = 'action-btn large-action-btn mb-10';
            btn.style.backgroundColor = '#ff8c00';
            btn.textContent = `🚪 「${k.name}」に入る`;
            btn.onclick = () => enterKitchen(k.id, k.name);
            listDiv.appendChild(btn);
        });
    } else {
        document.getElementById('existing-kitchen-section').classList.add('hidden');
    }
}

async function saveKitchenToHistory(newId, newName) {
    const userDocRef = doc(db, "users", auth.currentUser.uid);
    const userDoc = await getDoc(userDocRef);
    let kitchens = (userDoc.exists() && userDoc.data().kitchens) ? userDoc.data().kitchens : [];
    
    if (!kitchens.some(k => k.id === newId)) {
        kitchens.push({ id: newId, name: newName });
        await setDoc(userDocRef, { kitchens: kitchens }, { merge: true });
    }
}

async function createNewFamily() {
    const nameInput = document.getElementById('new-family-name').value.trim();
    if (!nameInput) return alert("キッチン名を入力してください。");

    try {
        const docRef = await addDoc(collection(db, "families"), { name: nameInput, createdAt: new Date() });
        await saveKitchenToHistory(docRef.id, nameInput);
        alert(`「${nameInput}」を作成しました！\nヘッダーのIDをタップして家族に共有しましょう。`);
        await enterKitchen(docRef.id, nameInput);
    } catch(e) {
        console.error(e);
        alert("キッチンの作成に失敗しました。");
    }
}

async function joinFamily() {
    const idInput = document.getElementById('join-family-id').value.trim();
    if (!idInput) return alert("合言葉(ID)を入力してください。");
    try {
        const docSnap = await getDoc(doc(db, "families", idInput));
        if (docSnap.exists()) {
            const joinedName = docSnap.data().name || "名称未設定のキッチン";
            await saveKitchenToHistory(idInput, joinedName);
            alert(`「${joinedName}」に参加しました！`);
            await enterKitchen(idInput, joinedName);
        } else {
            alert("指定された合言葉のキッチンが見つかりません。入力ミスがないか確認してください。");
        }
    } catch(e) {
        console.error(e);
        alert("エラーが発生しました。");
    }
}

async function enterKitchen(fId, fName) {
    currentFamilyId = fId;
    currentFamilyName = fName;
    
    document.getElementById('kitchen-screen').classList.add('hidden');
    document.getElementById('app-main').classList.remove('hidden');
    
    document.getElementById('header-family-id').textContent = currentFamilyId;
    document.getElementById('header-family-name').textContent = currentFamilyName; 
    
    // ▼ 追加: テキストをセットした直後にサイズを自動調整する ▼
    fitKitchenName();
    
    await loadDataFromFirebase();
}

async function returnToMyPage() {
    currentFamilyId = null;
    currentFamilyName = "";
    
    document.getElementById('app-main').classList.add('hidden');
    document.getElementById('kitchen-screen').classList.remove('hidden');
    
    const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
    let kitchens = (userDoc.exists() && userDoc.data().kitchens) ? userDoc.data().kitchens : [];
    renderKitchenList(kitchens);
}

// IDコピー機能
function copyFamilyId() {
    if (!currentFamilyId) return;
    navigator.clipboard.writeText(currentFamilyId).then(() => {
        alert("IDをコピーしました！家族に共有してください。");
    }).catch(err => {
        console.error('コピーに失敗しました', err);
        const textArea = document.createElement("textarea");
        textArea.value = currentFamilyId;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            alert("IDをコピーしました！家族に共有してください。");
        } catch (e) {
            alert("コピーに失敗しました。");
        }
        document.body.removeChild(textArea);
    });
}

// 起動時の自動監視
onAuthStateChanged(auth, async (user) => {
    if (user) {
        document.getElementById('auth-screen').classList.add('hidden');
        document.getElementById('kitchen-screen').classList.remove('hidden');
        document.getElementById('app-main').classList.add('hidden');
        
        const userDoc = await getDoc(doc(db, "users", user.uid));
        let kitchens = (userDoc.exists() && userDoc.data().kitchens) ? userDoc.data().kitchens : [];
        renderKitchenList(kitchens);
    } else {
        document.getElementById('auth-screen').classList.remove('hidden');
        document.getElementById('kitchen-screen').classList.add('hidden');
        document.getElementById('app-main').classList.add('hidden');
    }
});

// === Firebase保存・読み込み ===
async function saveInventory() { await setDoc(doc(db, "families", currentFamilyId, "settings", "inventory"), inventoryStock); }
async function saveShoppingChecked() { await setDoc(doc(db, "families", currentFamilyId, "settings", "shoppingChecked"), shoppingChecked); }
async function saveSelectedRecipes() { await setDoc(doc(db, "families", currentFamilyId, "settings", "selectedRecipes"), { ids: selectedRecipeIds }); }
async function saveUnitsToFirebase() { await setDoc(doc(db, "families", currentFamilyId, "settings", "units"), { list: units }); }

async function loadDataFromFirebase() {
    const querySnapshot = await getDocs(collection(db, "families", currentFamilyId, "foods"));
    foods = [];
    querySnapshot.forEach((doc) => foods.push(doc.data()));
    foods = foods.map(f => f.category ? f : { ...f, category: 'その他' });

    const recipeSnapshot = await getDocs(collection(db, "families", currentFamilyId, "recipes"));
    recipes = [];
    recipeSnapshot.forEach((doc) => recipes.push(doc.data()));

    const invSnap = await getDoc(doc(db, "families", currentFamilyId, "settings", "inventory"));
    if (invSnap.exists()) inventoryStock = invSnap.data();

    const shopSnap = await getDoc(doc(db, "families", currentFamilyId, "settings", "shoppingChecked"));
    if (shopSnap.exists()) shoppingChecked = shopSnap.data();

    const selSnap = await getDoc(doc(db, "families", currentFamilyId, "settings", "selectedRecipes"));
    if (selSnap.exists()) selectedRecipeIds = selSnap.data().ids || [];

    const unitSnap = await getDoc(doc(db, "families", currentFamilyId, "settings", "units"));
    if (unitSnap.exists()) units = unitSnap.data().list || units;

    renderUnits(); renderInventory(); renderRecipes(); renderMenuRecipes(); renderShoppingList(); renderCooking(); updateModalUnitOptions();
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    const btn = document.querySelector(`.nav-btn[onclick*="${tabId}"]`);
    if (btn) btn.classList.add('active');
}

function closeModal(modalId) { document.getElementById(modalId).classList.add('hidden'); }
window.onclick = function(event) { if (event.target.classList.contains('modal')) event.target.classList.add('hidden'); }

function openInfoModal(type) {
    const infos = {
        'menu': { title: '献立選択の使い方', text: 'レシピをクリックして今日の献立に追加します。（複数選択可）' },
        'inventory': { title: '食材管理の使い方', text: '現在登録されている全食材の在庫を一覧できます。' },
        'shopping': { title: '買い物リストの使い方', text: 'スーパーでカゴに食材を入れたらチェックをつけます。' },
        'cooking': { title: '調理画面の使い方', text: '今日の献立の手順を確認しながら調理を進めます。' },
        'settings': { title: '管理画面の使い方', text: 'アプリの基本データ（単位・レシピマスター）を管理します。' }
    };
    document.getElementById('info-modal-title').textContent = infos[type].title;
    document.getElementById('info-modal-body').innerHTML = infos[type].text;
    document.getElementById('info-modal').classList.remove('hidden');
}

// === 食材マスター・在庫 ===
function openFoodModal(foodName = null) {
    updateModalUnitOptions();
    const deleteBtn = document.getElementById('modal-food-delete-btn');
    
    if (foodName) {
        editingFoodIndex = foods.findIndex(f => f.name === foodName);
        const food = foods[editingFoodIndex];
        document.getElementById('food-modal-title').textContent = '食材の編集';
        document.getElementById('modal-food-name').value = food.name;
        document.getElementById('modal-food-category').value = food.category;
        document.getElementById('modal-cooking-unit').value = food.cookingUnit;
        document.getElementById('modal-shopping-unit').value = food.shoppingUnit;
        document.getElementById('modal-conversion-rate').value = food.conversionRate || ''; 
        document.getElementById('modal-food-submit-btn').textContent = '更新する';
        deleteBtn.classList.remove('hidden');
    } else {
        editingFoodIndex = -1;
        document.getElementById('food-modal-title').textContent = '食材の登録';
        document.getElementById('modal-food-name').value = '';
        document.getElementById('modal-food-category').value = '肉類';
        document.getElementById('modal-cooking-unit').value = '';
        document.getElementById('modal-shopping-unit').value = '';
        document.getElementById('modal-conversion-rate').value = ''; 
        document.getElementById('modal-food-submit-btn').textContent = '登録する';
        deleteBtn.classList.add('hidden');
    }
    updateConversionText(); 
    document.getElementById('food-modal').classList.remove('hidden');
}

async function saveFoodFromModal() {
    const name = document.getElementById('modal-food-name').value.trim();
    const category = document.getElementById('modal-food-category').value;
    const cookingUnit = document.getElementById('modal-cooking-unit').value;
    const shoppingUnit = document.getElementById('modal-shopping-unit').value;
    const rateInput = document.getElementById('modal-conversion-rate').value;
    const conversionRate = rateInput ? parseFloat(rateInput) : null;
    
    if (!name || !cookingUnit || !shoppingUnit) return alert('「食材名」「単位」はすべて入力してください。');
    const newFoodData = { name, category, cookingUnit, shoppingUnit, conversionRate };

    if (editingFoodIndex >= 0) {
        const oldName = foods[editingFoodIndex].name;
        if (oldName !== name) {
            await deleteDoc(doc(db, "families", currentFamilyId, "foods", oldName));
            inventoryStock[name] = inventoryStock[oldName] || 0;
            delete inventoryStock[oldName];
            await saveInventory(); 
            
            if (shoppingChecked[oldName] !== undefined) {
                shoppingChecked[name] = shoppingChecked[oldName];
                delete shoppingChecked[oldName];
                await saveShoppingChecked(); 
            }
            
            for (const recipe of recipes) {
                let updated = false;
                recipe.ingredients.forEach(ing => {
                    if (ing.foodName === oldName) { ing.foodName = name; updated = true; }
                });
                if (updated) await setDoc(doc(db, "families", currentFamilyId, "recipes", recipe.id.toString()), recipe);
            }
        }
        foods[editingFoodIndex] = newFoodData;
    } else {
        if (foods.find(f => f.name === name)) return alert('すでに同じ名前の食材が登録されています。');
        foods.push(newFoodData);
    }
    
    await setDoc(doc(db, "families", currentFamilyId, "foods", name), newFoodData);
    closeModal('food-modal');
    updateAllRecipeIngredientSelects();
    renderInventory(); renderShoppingList(); renderMenuRecipes(); renderCooking();
}

async function deleteFoodFromModal() {
    if (editingFoodIndex >= 0) {
        const foodName = foods[editingFoodIndex].name;
        if(confirm(`「${foodName}」を食材一覧から削除しますか？\n（※在庫データも消去されます）`)) {
            await deleteDoc(doc(db, "families", currentFamilyId, "foods", foodName));
            foods = foods.filter(f => f.name !== foodName);
            
            delete inventoryStock[foodName];
            delete shoppingChecked[foodName];
            await saveInventory();      
            await saveShoppingChecked();
            
            updateAllRecipeIngredientSelects();
            renderInventory(); renderShoppingList(); renderMenuRecipes();
            closeModal('food-modal');
        }
    }
}

async function updateStock(foodName, value) {
    inventoryStock[foodName] = parseFloat(value) || 0;
    await saveInventory(); 
    renderInventory(); renderShoppingList(); renderMenuRecipes(); renderCooking(); 
}

function renderInventory() {
    const container = document.getElementById('inventory-list');
    if (!container) return;

    if (foods.length === 0) {
        container.innerHTML = '<p class="empty-msg">食材が登録されていません。「＋ 食材を追加」から登録してください。</p>';
        return;
    }

    const required = calculateRequiredFoods();
    let html = '';

    CATEGORIES.forEach(cat => {
        const catFoods = foods.filter(f => f.category === cat);
        if (catFoods.length === 0) return;

        html += `<details class="category-details" open>
                    <summary class="category-summary">${cat} <span class="category-count">(${catFoods.length}件)</span></summary>
                    <div class="inventory-grid">
                        <div class="inv-header">食材名</div>
                        <div class="inv-header">在庫</div>
                        <div class="inv-header">今日の必要数</div>
                        <div class="inv-header text-center">操作</div>`;

        catFoods.forEach(food => {
            const foodName = food.name;
            const unit = food.cookingUnit;
            const stock = inventoryStock[foodName] || 0;
            const reqAmount = required[foodName] || 0;
            const lacking = Math.max(0, reqAmount - stock);

            let statusHtml = '<span class="status-none">必要なし</span>';
            if (reqAmount > 0) {
                if (lacking > 0) {
                    statusHtml = `<span class="status-text text-red">必要:${reqAmount}${unit}<br>(不足:${lacking}${unit})</span>`;
                } else {
                    statusHtml = `<span class="status-text text-green">必要:${reqAmount}${unit}<br>(足りています)</span>`;
                }
            }
            const rowClass = reqAmount > 0 ? 'highlight-row' : '';
            html += `
                <div class="inv-cell font-bold ${rowClass}">${foodName}</div>
                <div class="inv-cell ${rowClass}">
                    <input type="number" min="0" step="any" class="stock-input" value="${stock}" onchange="updateStock('${foodName}', this.value)"> ${unit}
                </div>
                <div class="inv-cell cell-status ${rowClass}">${statusHtml}</div>
                <div class="inv-cell cell-action ${rowClass}">
                    <button onclick="openFoodModal('${foodName}')" class="icon-btn" title="修正">✏️</button>
                </div>
            `;
        });
        html += `</div></details>`;
    });
    container.innerHTML = html;
}

// === 献立・買い物・調理機能 ===
async function toggleMenuSelection(id) {
    if (selectedRecipeIds.includes(id)) selectedRecipeIds = selectedRecipeIds.filter(rId => rId !== id);
    else selectedRecipeIds.push(id);
    await saveSelectedRecipes();
    renderMenuRecipes(); renderInventory(); renderShoppingList(); renderCooking();
}

function checkIfCookable(recipe) {
    if (!recipe.ingredients || recipe.ingredients.length === 0) return false;
    for (const ing of recipe.ingredients) {
        const reqAmount = parseFloat(ing.amount) || 0;
        const stock = inventoryStock[ing.foodName] || 0;
        if (stock < reqAmount) return false; 
    }
    return true;
}

function renderMenuRecipes() {
    const gridElement = document.getElementById('menu-recipe-list');
    if (!gridElement) return;
    gridElement.innerHTML = '';
    if (recipes.length === 0) {
        gridElement.innerHTML = '<p class="empty-msg">レシピがありません。みんなの広場から探すか、新しく登録してください。</p>';
        return;
    }
    recipes.forEach(recipe => {
        const isSelected = selectedRecipeIds.includes(recipe.id);
        const isCookable = checkIfCookable(recipe);
        const card = document.createElement('div');
        card.className = `recipe-card ${isSelected ? 'selected' : ''}`;
        
        card.onclick = (e) => {
            if (e.target.tagName !== 'A') toggleMenuSelection(recipe.id);
        };
        
        let urlHtml = recipe.url ? `<a href="${recipe.url}" target="_blank" rel="noopener noreferrer" class="reference-link mb-10">🔗 参考レシピを開く</a>` : '';
        
        card.innerHTML = `
            ${isCookable ? '<div class="cookable-badge">✨ 今ある在庫で作れます！</div>' : ''}
            <h3>${recipe.name}</h3>
            <div class="recipe-card-meta mb-10">
                <p><strong>材料:</strong> ${recipe.ingredients.map(i => i.foodName).join('、')}</p>
                <p><strong>手順:</strong> ${recipe.steps.length}ステップ</p>
                ${urlHtml}
            </div>
            <div class="selection-indicator">${isSelected ? '✓ 献立に追加済み' : '＋ 献立に追加'}</div>
        `;
        gridElement.appendChild(card);
    });
}

function calculateRequiredFoods() {
    const required = {};
    selectedRecipeIds.forEach(id => {
        const recipe = recipes.find(r => r.id === id);
        if (recipe) {
            recipe.ingredients.forEach(ing => {
                if (!required[ing.foodName]) required[ing.foodName] = 0;
                required[ing.foodName] += parseFloat(ing.amount) || 0;
            });
        }
    });
    return required;
}

async function toggleShoppingCheck(foodName, isChecked) {
    shoppingChecked[foodName] = isChecked;
    await saveShoppingChecked();
    renderShoppingList();
}

function renderShoppingList() {
    const container = document.getElementById('shopping-list-container');
    const completeBtnContainer = document.getElementById('shopping-complete-container');
    if (!container || !completeBtnContainer) return;

    const required = calculateRequiredFoods();
    container.innerHTML = '';
    let hasMissing = false;

    for (const [foodName, reqAmount] of Object.entries(required)) {
        const stock = inventoryStock[foodName] || 0;
        const lacking = reqAmount - stock;
        
        if (lacking > 0) {
            hasMissing = true;
            const foodMaster = foods.find(f => f.name === foodName);
            const unit = foodMaster ? foodMaster.cookingUnit : '';
            const shopUnit = foodMaster ? foodMaster.shoppingUnit : '';
            const conversionRate = foodMaster ? foodMaster.conversionRate : null; 
            
            const isChecked = shoppingChecked[foodName] || false;
            const li = document.createElement('li');
            
            let lackingHtml = `<span class="unit-badge alert-badge">不足: ${lacking} ${unit}</span>`;
            let buyInputHtml = '';
            
            if (conversionRate) {
                const shopAmount = Math.ceil(lacking / conversionRate);
                lackingHtml += `<span class="unit-badge">約 ${shopAmount} ${shopUnit} 必要</span>`;
                buyInputHtml = `購入量: <input type="number" id="buy-amount-${foodName}" class="buy-amount-input" value="${shopAmount}" min="0" step="any"> ${shopUnit}`;
            } else {
                lackingHtml += `<span class="unit-badge">購入単位: ${shopUnit}</span>`;
                buyInputHtml = `購入量: <input type="number" id="buy-amount-${foodName}" class="buy-amount-input" value="${lacking}" min="0" step="any"> ${unit}`;
            }
            
            li.innerHTML = `
                <div class="shopping-item-wrapper ${isChecked ? 'checked' : ''}">
                    <label class="shopping-item-top">
                        <input type="checkbox" onchange="toggleShoppingCheck('${foodName}', this.checked)" ${isChecked ? 'checked' : ''}>
                        <div class="shopping-details">
                            <span class="shopping-food-name">${foodName}</span>
                            ${lackingHtml}
                        </div>
                    </label>
                    <div class="shopping-item-bottom">
                        ${buyInputHtml}
                    </div>
                </div>
            `;
            container.appendChild(li);
        }
    }
    
    if (!hasMissing) {
        completeBtnContainer.classList.add('hidden');
        if (selectedRecipeIds.length === 0) container.innerHTML = '<p class="empty-msg">献立が選択されていません。</p>';
        else container.innerHTML = '<p class="success-msg">🎉 必要な食材はすべて揃っています！買い物は不要です。</p>';
    } else {
        completeBtnContainer.classList.remove('hidden');
    }
}

async function completeShopping() {
    let itemsAdded = 0;
    for (const [foodName, isChecked] of Object.entries(shoppingChecked)) {
        if (isChecked) {
            const inputEl = document.getElementById(`buy-amount-${foodName}`);
            if (inputEl) {
                const boughtAmount = parseFloat(inputEl.value) || 0;
                const foodMaster = foods.find(f => f.name === foodName);
                const rate = (foodMaster && foodMaster.conversionRate) ? foodMaster.conversionRate : 1;
                inventoryStock[foodName] = (inventoryStock[foodName] || 0) + (boughtAmount * rate);
                itemsAdded++;
            }
        }
    }
    if (itemsAdded === 0) return alert('チェックを入れた食材がありません。');
    
    await saveInventory();
    shoppingChecked = {};
    await saveShoppingChecked();
    
    alert(`買い物完了！ ${itemsAdded}種類の食材を在庫に追加しました。`);
    renderInventory(); renderShoppingList(); renderMenuRecipes(); renderCooking();
}

function renderCooking() {
    const container = document.getElementById('cooking-recipe-list');
    const completeBtnContainer = document.getElementById('cooking-complete-container');
    const btn = document.getElementById('cooking-complete-btn');
    const warning = document.getElementById('cooking-warning-msg');
    
    if (!container || !completeBtnContainer || !btn || !warning) return;
    
    if (selectedRecipeIds.length === 0) {
        container.innerHTML = '<p class="empty-msg">献立が選択されていません。</p>';
        completeBtnContainer.classList.add('hidden');
        return;
    }
    completeBtnContainer.classList.remove('hidden');
    container.innerHTML = '';
    
    const required = calculateRequiredFoods();
    let isAllSufficient = true;
    for (const [foodName, reqAmount] of Object.entries(required)) {
        const stock = inventoryStock[foodName] || 0;
        if (stock < reqAmount) { isAllSufficient = false; break; }
    }

    if (isAllSufficient) {
        btn.disabled = false; warning.classList.add('hidden');
    } else {
        btn.disabled = true; warning.classList.remove('hidden');
    }
    
    selectedRecipeIds.forEach(id => {
        const recipe = recipes.find(r => r.id === id);
        if (!recipe) return;
        const card = document.createElement('div');
        card.className = 'cooking-recipe-card';
        
        let urlHtml = recipe.url ? `<a href="${recipe.url}" target="_blank" rel="noopener noreferrer" class="reference-link mb-10">🔗 参考レシピ動画/サイトを見る</a>` : '';
        
        let stepsHtml = '<ol class="cooking-steps">';
        recipe.steps.forEach(step => stepsHtml += `<li>${step}</li>`);
        stepsHtml += '</ol>';
        let ingredientsHtml = '<ul class="cooking-ingredients">';
        recipe.ingredients.forEach(ing => {
            const foodMaster = foods.find(f => f.name === ing.foodName);
            const unit = foodMaster ? foodMaster.cookingUnit : '';
            ingredientsHtml += `<li><strong>${ing.foodName}:</strong> ${ing.amount} ${unit}</li>`;
        });
        ingredientsHtml += '</ul>';
        card.innerHTML = `
            <h3>${recipe.name}</h3>
            ${urlHtml}
            <div class="recipe-section"><h4>材料</h4>${ingredientsHtml}</div>
            <div class="recipe-section"><h4>手順</h4>${stepsHtml}</div>
        `;
        container.appendChild(card);
    });
}

async function completeCooking() {
    if (!confirm('調理を完了し、今日の献立で使用した食材を在庫から減らしますか？')) return;
    const required = calculateRequiredFoods();
    for (const [foodName, reqAmount] of Object.entries(required)) {
        const currentStock = inventoryStock[foodName] || 0;
        inventoryStock[foodName] = Math.max(0, currentStock - reqAmount);
    }
    await saveInventory(); 
    selectedRecipeIds = [];
    await saveSelectedRecipes(); 
    shoppingChecked = {};
    await saveShoppingChecked(); 
    
    alert('調理お疲れ様でした！在庫を消費し、献立をリセットしました。');
    renderMenuRecipes(); renderInventory(); renderShoppingList(); renderCooking();
}

function toggleUnitEditMode() {
    isUnitEditMode = !isUnitEditMode;
    const btn = document.getElementById('edit-unit-btn');
    btn.textContent = isUnitEditMode ? '完了' : '編集';
    document.getElementById('settings').classList.toggle('unit-edit-active', isUnitEditMode);
}

function renderUnits() {
    const listElement = document.getElementById('unit-list');
    listElement.innerHTML = '';
    units.forEach((unit, index) => {
        const li = document.createElement('li');
        li.textContent = unit;
        const btn = document.createElement('button');
        btn.textContent = '×';
        btn.className = 'unit-delete-btn';
        btn.onclick = async () => { if(isUnitEditMode) { units.splice(index, 1); await saveUnitsAndRender(); } };
        li.appendChild(btn);
        listElement.appendChild(li);
    });
    updateModalUnitOptions(); updateAllRecipeIngredientSelects();
}

async function addUnit() {
    const input = document.getElementById('new-unit-input');
    const val = input.value.trim();
    if (val && !units.includes(val)) { units.push(val); input.value = ''; await saveUnitsAndRender(); }
}

async function saveUnitsAndRender() { await saveUnitsToFirebase(); renderUnits(); }

function updateModalUnitOptions() {
    const cookSelect = document.getElementById('modal-cooking-unit');
    const shopSelect = document.getElementById('modal-shopping-unit');
    if(!cookSelect || !shopSelect) return;
    cookSelect.innerHTML = '<option value="">料理用...</option>';
    shopSelect.innerHTML = '<option value="">購入用...</option>';
    units.forEach(unit => { cookSelect.appendChild(new Option(unit, unit)); shopSelect.appendChild(new Option(unit, unit)); });
}

function updateConversionText() {
    const cookUnit = document.getElementById('modal-cooking-unit').value || '料理単位';
    const shopUnit = document.getElementById('modal-shopping-unit').value || '購入単位';
    document.getElementById('conv-cook-unit').textContent = cookUnit;
    document.getElementById('conv-shop-unit').textContent = shopUnit;
}

// === レシピ作成・編集機能 ===
function openRecipeModal() {
    resetRecipeForm();
    document.getElementById('modal-title').textContent = 'レシピの登録';
    document.getElementById('modal-recipe-delete-btn').classList.add('hidden');
    document.getElementById('recipe-modal').classList.remove('hidden');
}

function addRecipeIngredientRow(foodName = '', amount = '') {
    const container = document.getElementById('recipe-ingredients-container');
    const row = document.createElement('div');
    row.className = 'dynamic-row ingredient-row';
    const select = document.createElement('select');
    select.className = 'recipe-food-select';
    select.innerHTML = '<option value="">食材を選択...</option>';
    foods.forEach(f => select.appendChild(new Option(f.name, f.name)));
    select.value = foodName;
    select.onchange = function() {
        const selectedFood = foods.find(f => f.name === this.value);
        this.parentElement.querySelector('.unit-text').textContent = selectedFood ? selectedFood.cookingUnit : '-';
    };
    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'recipe-amount-input';
    input.placeholder = '分量';
    input.value = amount;
    const unitSpan = document.createElement('span');
    unitSpan.className = 'unit-text';
    const initialFood = foods.find(f => f.name === foodName);
    unitSpan.textContent = initialFood ? initialFood.cookingUnit : '-';
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-row-btn';
    removeBtn.textContent = '×';
    removeBtn.onclick = function() { row.remove(); };
    row.appendChild(select); row.appendChild(input); row.appendChild(unitSpan); row.appendChild(removeBtn);
    container.appendChild(row);
}

function addRecipeStepRow(stepText = '') {
    const container = document.getElementById('recipe-steps-container');
    const row = document.createElement('div');
    row.className = 'dynamic-row step-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'step-input';
    input.placeholder = '手順を記入';
    input.value = stepText;
    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-row-btn';
    removeBtn.textContent = '×';
    removeBtn.onclick = function() { row.remove(); };
    row.appendChild(input); row.appendChild(removeBtn);
    container.appendChild(row);
}

function updateAllRecipeIngredientSelects() {
    const selects = document.querySelectorAll('.recipe-food-select');
    selects.forEach(select => {
        const currentValue = select.value;
        select.innerHTML = '<option value="">食材を選択...</option>';
        foods.forEach(f => select.appendChild(new Option(f.name, f.name)));
        select.value = currentValue; 
    });
}

async function saveRecipe() {
    const name = document.getElementById('recipe-name-input').value.trim();
    const url = document.getElementById('recipe-url-input').value.trim();
    
    if (!name) return alert('レシピ名を入力してください。');
    const ingredients = [];
    document.querySelectorAll('.ingredient-row').forEach(row => {
        const foodName = row.querySelector('.recipe-food-select').value;
        const amount = row.querySelector('.recipe-amount-input').value;
        if (foodName && amount) ingredients.push({ foodName, amount });
    });
    const steps = [];
    document.querySelectorAll('.step-row').forEach(row => {
        const step = row.querySelector('.step-input').value.trim();
        if (step) steps.push(step);
    });
    
    const newId = editingRecipeId || "rec_" + Date.now().toString() + Math.random().toString(36).substring(2, 7);
    const newRecipe = { id: newId, name, ingredients, steps, familyId: currentFamilyId, url };
    
    if (editingRecipeId) {
        const index = recipes.findIndex(r => r.id === editingRecipeId);
        if (index > -1) recipes[index] = newRecipe;
    } else {
        recipes.push(newRecipe);
    }
    
    await setDoc(doc(db, "families", currentFamilyId, "recipes", newRecipe.id), newRecipe);
    await setDoc(doc(db, "public_recipes", newRecipe.id), newRecipe);
    
    renderRecipes(); renderMenuRecipes(); renderInventory(); renderShoppingList(); renderCooking();
    closeModal('recipe-modal');
}

function resetRecipeForm() {
    document.getElementById('recipe-name-input').value = '';
    document.getElementById('recipe-url-input').value = '';
    document.getElementById('recipe-ingredients-container').innerHTML = '';
    document.getElementById('recipe-steps-container').innerHTML = '';
    editingRecipeId = null;
    document.getElementById('recipe-submit-btn').textContent = 'レシピを保存';
    addRecipeIngredientRow();
    addRecipeStepRow();
}

function renderRecipes() {
    const listElement = document.getElementById('settings-recipe-list');
    listElement.innerHTML = '';
    recipes.forEach(recipe => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="food-name-display">${recipe.name}</span>`;
        
        const btnGroup = document.createElement('div');
        btnGroup.className = 'action-buttons';
        
        const editBtn = document.createElement('button');
        editBtn.innerHTML = '✏️';
        editBtn.className = 'icon-btn';
        editBtn.title = '修正';
        editBtn.onclick = () => loadRecipeToForm(recipe.id);
        
        btnGroup.appendChild(editBtn);
        li.appendChild(btnGroup);
        listElement.appendChild(li);
    });
}

function loadRecipeToForm(id) {
    const recipe = recipes.find(r => r.id === id);
    if (!recipe) return;
    document.getElementById('recipe-name-input').value = recipe.name;
    document.getElementById('recipe-url-input').value = recipe.url || '';
    
    document.getElementById('recipe-ingredients-container').innerHTML = '';
    document.getElementById('recipe-steps-container').innerHTML = '';
    recipe.ingredients.forEach(ing => addRecipeIngredientRow(ing.foodName, ing.amount));
    recipe.steps.forEach(step => addRecipeStepRow(step));
    editingRecipeId = id;
    document.getElementById('modal-title').textContent = 'レシピの編集';
    document.getElementById('recipe-submit-btn').textContent = 'レシピを更新';
    document.getElementById('modal-recipe-delete-btn').classList.remove('hidden');
    document.getElementById('recipe-modal').classList.remove('hidden');
}

async function deleteRecipeFromModal() {
    if (editingRecipeId) {
        const recipe = recipes.find(r => r.id === editingRecipeId);
        if (recipe && confirm(`「${recipe.name}」を削除しますか？\n（広場の石ころも削除されます）`)) {
            await deleteDoc(doc(db, "families", currentFamilyId, "recipes", editingRecipeId.toString()));
            await deleteDoc(doc(db, "public_recipes", editingRecipeId.toString()));
            
            recipes = recipes.filter(r => r.id !== editingRecipeId);
            selectedRecipeIds = selectedRecipeIds.filter(id => id !== editingRecipeId);
            await saveSelectedRecipes(); 
            
            renderRecipes(); renderMenuRecipes(); renderInventory(); renderShoppingList(); renderCooking();
            closeModal('recipe-modal');
        }
    }
}

// === 新機能：みんなのレシピ広場（全画面オーバーレイ方式） ===
async function openPublicRecipesModal() {
    try {
        const querySnapshot = await getDocs(collection(db, "public_recipes"));
        publicRecipes = [];
        querySnapshot.forEach((doc) => {
            const data = doc.data();
            if (data.familyId !== currentFamilyId) {
                publicRecipes.push(data);
            }
        });
        renderPublicRecipes();
        document.getElementById('public-recipe-modal').classList.remove('hidden');
    } catch(e) {
        console.error(e);
        alert("広場のレシピ取得に失敗しました。");
    }
}

function renderPublicRecipes() {
    const gridElement = document.getElementById('public-recipe-list');
    gridElement.innerHTML = '';
    if (publicRecipes.length === 0) {
        gridElement.innerHTML = '<p class="empty-msg">まだ他の人が公開したレシピはありません。</p>';
        return;
    }
    publicRecipes.forEach(recipe => {
        const alreadyHas = recipes.some(r => r.id === recipe.id);
        
        const card = document.createElement('div');
        card.className = 'recipe-card';
        
        let urlHtml = recipe.url ? `<a href="${recipe.url}" target="_blank" rel="noopener noreferrer" class="reference-link mb-10">🔗 参考レシピを開く</a>` : '';

        card.innerHTML = `
            <h3>${recipe.name}</h3>
            <div class="recipe-card-meta mb-10">
                <p><strong>材料:</strong> ${recipe.ingredients.map(i => i.foodName).join('、')}</p>
                <p><strong>手順:</strong> ${recipe.steps.length}ステップ</p>
                ${urlHtml}
            </div>
            ${alreadyHas 
                ? `<button disabled class="action-btn full-width-btn secondary-btn">✅ すでに手元にあります</button>` 
                : `<button onclick="copyPublicRecipe('${recipe.id}')" class="action-btn full-width-btn shortcut-btn">📥 手元にコピーする</button>`
            }
        `;
        gridElement.appendChild(card);
    });
}

async function copyPublicRecipe(recipeId) {
    const recipeToCopy = publicRecipes.find(r => r.id === recipeId);
    if (!recipeToCopy) return;
    
    if (confirm(`「${recipeToCopy.name}」をあなたのキッチンにコピー（追加）しますか？`)) {
        try {
            await setDoc(doc(db, "families", currentFamilyId, "recipes", recipeToCopy.id), recipeToCopy);
            alert("手元にコピーしました！自由に編集や献立への追加が可能です。");
            closeModal('public-recipe-modal');
            await loadDataFromFirebase(); 
        } catch(e) {
            console.error(e);
            alert("コピーに失敗しました。");
        }
    }
}

// === グローバル登録 ===
window.openRegisterModal = openRegisterModal;
window.registerWithEmail = registerWithEmail;
window.loginWithEmail = loginWithEmail;
window.resetPassword = resetPassword;
window.logoutAccount = logoutAccount;
window.createNewFamily = createNewFamily;
window.joinFamily = joinFamily;
window.enterKitchen = enterKitchen;
window.returnToMyPage = returnToMyPage;
window.copyFamilyId = copyFamilyId;
window.switchTab = switchTab;
window.closeModal = closeModal;
window.openInfoModal = openInfoModal;
window.openFoodModal = openFoodModal;
window.saveFoodFromModal = saveFoodFromModal;
window.deleteFoodFromModal = deleteFoodFromModal;
window.updateStock = updateStock;
window.toggleMenuSelection = toggleMenuSelection;
window.toggleShoppingCheck = toggleShoppingCheck;
window.completeShopping = completeShopping;
window.completeCooking = completeCooking;
window.toggleUnitEditMode = toggleUnitEditMode;
window.addUnit = addUnit;
window.updateConversionText = updateConversionText;
window.openRecipeModal = openRecipeModal;
window.addRecipeIngredientRow = addRecipeIngredientRow;
window.addRecipeStepRow = addRecipeStepRow;
window.saveRecipe = saveRecipe;
window.loadRecipeToForm = loadRecipeToForm;
window.deleteRecipeFromModal = deleteRecipeFromModal;
window.openPublicRecipesModal = openPublicRecipesModal;
window.copyPublicRecipe = copyPublicRecipe;

// === キッチン名を枠内に自動縮小して収める機能（エクセル的な動き） ===
function fitKitchenName() {
    const el = document.getElementById('header-family-name');
    if (!el) return;
    
    // 一旦リセットして本来の文字幅を計算
    el.style.transform = 'none';
    const parentWidth = el.parentElement.clientWidth - 20; // 左右10pxずつの余裕
    const textWidth = el.scrollWidth;
    
    // 文字幅が枠を超えている場合、超えた比率だけ全体を縮小(scale)する
    if (textWidth > parentWidth && parentWidth > 0) {
        const scale = parentWidth / textWidth;
        el.style.transform = `scale(${scale})`;
    }
}
// 画面サイズ（スマホの縦横など）が変わった時にも自動計算する
window.addEventListener('resize', fitKitchenName);
