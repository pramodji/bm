<script lang="ts">
	import { 
		Plus, Search, Bookmark as BookmarkIcon, Trash2, Edit2, ExternalLink,
		GripVertical, Settings, X, Moon, Sun, Palette, Check, 
		FileSpreadsheet, Download, Upload, RefreshCw, AlertCircle,
		Tag, Image as ImageIcon, Clock, Copy, CopyPlus, Filter, EyeOff, Eye, List, LayoutList, SortAsc
	} from 'lucide-svelte';
	import { onMount } from 'svelte';

    const API_URL = 'http://localhost:3000/db';

	// --- 1. APP STATE ---
	interface Bookmark { 
		id: string; title: string; url: string; group: string; position: number;
		tags?: string[]; notes?: string; icon?: string; 
	}

	let bookmarks = $state<Bookmark[]>([]);
	let groups = $state<string[]>([]);
	let appTitle = $state("Bookmark");
    let syncStatus = $state<"loading" | "synced" | "offline">("loading");
    let time = $state(new Date());

	// --- 2. UI STATE ---
	let searchQuery = $state("");
	let selectedTag = $state<string | null>(null);
	let isSettingsOpen = $state(false);
	let isEditMode = $state(false);
	let isDarkMode = $state(false);
    
    // DEFAULT OVERRIDES: Set to hidden/compact on launch
    let showTags = $state(false); 
    let compactMode = $state(true); 

	let accentColor = $state("blue"); 
	let editingGroupId = $state<string | null>(null);
	let groupRenameValue = $state("");
	let newUrl = $state("");
	let newGroupName = $state("");
	let draggedId = $state<string | null>(null);
    let groupSortStates = $state<Record<string, boolean>>({});

	// --- 3. CONTEXT MENU & MODAL STATE ---
	let isEditModalOpen = $state(false);
	let activeBookmark = $state<Bookmark | null>(null);
	let contextMenu = $state<{ x: number, y: number, show: boolean, target: Bookmark | null }>({ x: 0, y: 0, show: false, target: null });

	let tempTitle = $state("");
	let tempUrl = $state("");
	let tempTags = $state("");
    let tempNotes = $state("");
	let tempIcon = $state("");

	const themeMap: Record<string, string> = {
		blue: "#2563eb", emerald: "#10b981", purple: "#8b5cf6", rose: "#f43f5e", amber: "#f59e0b"
	};

    const isSVG = (str: string) => str?.trim().startsWith('<svg') || str?.trim().startsWith('<i ');

	onMount(async () => {
        const timer = setInterval(() => { time = new Date(); }, 1000);
		isDarkMode = localStorage.getItem('mk_dark') === 'true';
		accentColor = localStorage.getItem('mk_accent') || "blue";
		await loadData();
        
        const closeMenu = () => { contextMenu.show = false; };
        window.addEventListener('click', closeMenu);
        return () => {
            clearInterval(timer);
            window.removeEventListener('click', closeMenu);
        };
	});

	async function loadData() {
        try {
            const res = await fetch(API_URL);
            const data = await res.json();
            bookmarks = data.bookmarks || [];
            groups = data.groups || ["General"];
            appTitle = data.appTitle || "Bookmark";
            syncStatus = "synced";
        } catch (e) {
            syncStatus = "offline";
			groups = JSON.parse(localStorage.getItem('mk_groups') || '["General"]');
			bookmarks = JSON.parse(localStorage.getItem('mk_bookmarks') || '[]').map((b: any) => ({
                ...b, tags: b.tags || [], notes: b.notes || "", icon: b.icon || ""
            }));
        }
	}

	async function syncData() {
		localStorage.setItem('mk_groups', JSON.stringify(groups));
		localStorage.setItem('mk_bookmarks', JSON.stringify(bookmarks));
		localStorage.setItem('mk_dark', isDarkMode.toString());
		localStorage.setItem('mk_accent', accentColor);
        try {
            await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookmarks, groups, appTitle })
            });
            syncStatus = "synced";
        } catch (e) { syncStatus = "offline"; }
	}

    function toggleSort(groupName: string) {
        groupSortStates[groupName] = !groupSortStates[groupName];
    }

    function handleContextMenu(e: MouseEvent, bookmark: Bookmark) {
        e.preventDefault();
        contextMenu = { x: e.clientX, y: e.clientY, show: true, target: bookmark };
    }

    function duplicateBookmark(bookmark: Bookmark) {
        const newB = { ...bookmark, id: crypto.randomUUID(), title: `${bookmark.title} (Copy)`, position: bookmark.position + 1 };
        bookmarks = [...bookmarks, newB];
        syncData();
        contextMenu.show = false;
    }

    function deleteBookmark(id: string) {
        bookmarks = bookmarks.filter(b => b.id !== id);
        syncData();
        contextMenu.show = false;
    }

    function openEditModal(bookmark: Bookmark) {
		activeBookmark = bookmark;
		tempTitle = bookmark.title; tempUrl = bookmark.url;
		tempTags = bookmark.tags?.join(", ") || "";
        tempNotes = bookmark.notes || "";
		tempIcon = bookmark.icon || "";
		isEditModalOpen = true;
        contextMenu.show = false;
	}

	function savePopupChanges() {
		if (activeBookmark) {
			const tagArray = tempTags.split(",").map(t => t.trim()).filter(t => t !== "");
			bookmarks = bookmarks.map(b => b.id === activeBookmark!.id ? { 
                ...b, title: tempTitle, url: tempUrl, tags: tagArray, notes: tempNotes, icon: tempIcon 
            } : b);
			syncData(); isEditModalOpen = false;
		}
	}

    function deleteGroup(name: string) {
		if (confirm(`Delete group "${name}" and all its bookmarks?`)) {
			groups = groups.filter(g => g !== name);
			bookmarks = bookmarks.filter(b => b.group !== name);
			syncData();
		}
	}

    function exportJSON() {
		const data = { appTitle, groups, bookmarks };
		const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url; a.download = `bookmark_backup.json`;
		a.click();
	}

	function importJSON(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
		const reader = new FileReader();
		reader.onload = (ev) => {
			const data = JSON.parse(ev.target?.result as string);
			bookmarks = data.bookmarks;
			groups = data.groups; appTitle = data.appTitle;
			syncData();
		};
		reader.readAsText(file);
	}

	function importCSV(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0]; if (!file) return;
		const reader = new FileReader();
		reader.onload = (ev) => {
			const rows = (ev.target?.result as string).split('\n').map(r => r.split(','));
			const currentGroups = new Set(groups);
			rows.forEach((cols, i) => {
				if (i === 0 || !cols[0] || !cols[1]) return;
				const g = cols[2]?.trim() || "Imported";
				currentGroups.add(g);
				bookmarks = [...bookmarks, { id: crypto.randomUUID(), title: cols[0].trim(), url: cols[1].trim(), group: g, position: 0, tags: [], notes: "", icon: "" }];
			});
			groups = Array.from(currentGroups); syncData();
		};
		reader.readAsText(file);
	}

    function handleDrop(targetGroup: string, targetIndex: number) {
		if (!draggedId) return;
		const movedItem = bookmarks.find(b => b.id === draggedId);
		if (!movedItem) return;
		let otherItems = bookmarks.filter(b => b.id !== draggedId && b.group === targetGroup);
		otherItems.splice(targetIndex, 0, { ...movedItem, group: targetGroup });
		const rest = bookmarks.filter(b => b.group !== targetGroup && b.id !== draggedId);
		bookmarks = [...rest, ...otherItems.map((item, i) => ({ ...item, position: i }))];
		draggedId = null; syncData();
	}

	let allUniqueTags = $derived(Array.from(new Set(bookmarks.flatMap(b => b.tags || []))).sort());
	let filteredBookmarks = $derived(bookmarks.filter(b => {
		const matchesSearch = b.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                             b.notes?.toLowerCase().includes(searchQuery.toLowerCase());
		const matchesTag = !selectedTag || b.tags?.includes(selectedTag);
		return matchesSearch && matchesTag;
	}));

    function getGroupBookmarks(groupName: string) {
        let items = filteredBookmarks.filter(b => b.group === groupName);
        if (groupSortStates[groupName]) {
            return [...items].sort((a, b) => a.title.localeCompare(b.title));
        }
        return items.sort((a, b) => a.position - b.position);
    }
</script>

<svelte:head>
    <title>Bookmark</title>
</svelte:head>

<div class="{isDarkMode ? 'dark' : ''} h-screen w-screen transition-colors duration-300 app-container" style="--brand: {themeMap[accentColor]}">
	<div class="h-full w-full bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 flex flex-col overflow-hidden font-light">
		
		<header class="h-14 bg-white dark:bg-slate-900 border-b dark:border-slate-800 flex items-center px-4 justify-between shrink-0 shadow-sm z-20">
			<div class="flex items-center gap-6 flex-1">
				<div class="flex items-center gap-2 font-normal uppercase tracking-tighter text-xs" style="color: var(--brand)">
					<BookmarkIcon size={18} fill="currentColor" fill-opacity="0.2" /> 
					<span>Bookmark</span>
				</div>
				<div class="relative w-80 flex items-center gap-1">
					<div class="relative flex-1">
                        <Search class="absolute left-3 top-2.5 text-slate-400" size={14} />
                        <input bind:value={searchQuery} placeholder="Search..." class="w-full pl-10 pr-4 py-2 text-xs bg-slate-100 dark:bg-slate-800 border-none rounded-xl outline-none font-light" />
                    </div>
                    <button onclick={() => showTags = !showTags} class="p-2 text-slate-400 hover:text-slate-600" title="Toggle Tag Bar">
                        {#if showTags}<EyeOff size={16}/>{:else}<Filter size={16}/>{/if}
                    </button>
                    <button onclick={() => compactMode = !compactMode} class="p-2 text-slate-400 hover:text-slate-600" title="Toggle Bookmark Details">
                        {#if compactMode}<LayoutList size={16}/>{:else}<List size={16}/>{/if}
                    </button>
				</div>
			</div>

            <div class="hidden md:flex items-center gap-3 bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-4 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 shadow-inner">
				<Clock size={13} class="text-blue-500 opacity-60" />
				<span class="font-mono text-xs tracking-wider tabular-nums">
					{time.getHours().toString().padStart(2, '0')}:{time.getMinutes().toString().padStart(2, '0')}:{time.getSeconds().toString().padStart(2, '0')}
				</span>
			</div>

			<div class="flex items-center gap-3 flex-1 justify-end">
                <div class="flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-normal uppercase {syncStatus === 'synced' ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}">
                   {#if syncStatus === 'synced'}<RefreshCw size={12}/>{:else}<AlertCircle size={12}/>{/if}
                   {syncStatus === 'synced' ? 'Live' : 'Offline'}
                </div>
				<button onclick={() => {isDarkMode = !isDarkMode; syncData();}} class="p-2 transition-transform active:scale-90"><Moon size={18}/></button>
				<button onclick={() => isSettingsOpen = true} class="p-2 transition-transform active:scale-90"><Settings size={18}/></button>
			</div>
		</header>

        {#if showTags}
            <div class="px-4 py-2 bg-white dark:bg-slate-900 border-b dark:border-slate-800 flex gap-2 overflow-x-auto no-scrollbar shrink-0 transition-all duration-300">
                <button onclick={() => selectedTag = null} class="px-3 py-1 rounded-full text-[10px] uppercase font-light {selectedTag === null ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'}">All</button>
                {#each allUniqueTags as tag}
                    <button onclick={() => selectedTag = (selectedTag === tag ? null : tag)} class="px-3 py-1 rounded-full text-[10px] uppercase font-light {selectedTag === tag ? 'text-white' : 'bg-slate-100 text-slate-500'}" style={selectedTag === tag ? `background-color: var(--brand)` : ''}>#{tag}</button>
                {/each}
            </div>
        {/if}

		<main class="flex-1 p-6 overflow-y-auto grid gap-6 items-start content-start" style="grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));">
			{#each groups as group}
				<section class="flex flex-col">
					<div class="flex items-center justify-between mb-2 px-1">
						{#if editingGroupId === group}
							<div class="flex gap-1 w-full">
								<input bind:value={groupRenameValue} class="bg-transparent border-b border-blue-500 outline-none text-sm font-bold uppercase w-full" autofocus />
								<button onclick={() => { groups = groups.map(g => g === group ? groupRenameValue : g); bookmarks = bookmarks.map(b => b.group === group ? {...b, group: groupRenameValue} : b); editingGroupId = null; syncData(); }} class="text-green-500"><Check size={14}/></button>
							</div>
						{:else}
							<button onclick={() => toggleSort(group)} class="text-left group/title flex items-center gap-2">
                                <h2 class="text-[12px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{group}</h2>
                                <SortAsc size={10} class="transition-opacity {groupSortStates[group] ? 'text-blue-500' : 'text-slate-300 opacity-0 group-hover/title:opacity-100'}" />
                            </button>
							{#if isEditMode}
								<button onclick={() => {editingGroupId = group; groupRenameValue = group;}} class="text-slate-400"><Edit2 size={12}/></button>
							{/if}
						{/if}
					</div>

					<div class="bg-white dark:bg-slate-900 rounded-xl shadow-sm ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden divide-y dark:divide-slate-800" ondragover={(e) => e.preventDefault()} ondrop={() => handleDrop(group, getGroupBookmarks(group).length)}>
						{#if isEditMode}
							<div class="p-2 bg-slate-50 dark:bg-slate-800/50 flex gap-1">
								<input bind:value={newUrl} placeholder="Add URL..." class="flex-1 text-[10px] p-2 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700 outline-none font-light" />
								<button onclick={() => { if(!newUrl) return; bookmarks = [...bookmarks, { id: crypto.randomUUID(), title: newUrl.split('/')[2] || newUrl, url: newUrl.startsWith('http') ? newUrl : `https://${newUrl}`, group, position: bookmarks.length, tags: [], notes: "", icon: "" }]; newUrl = ""; syncData(); }} class="text-white px-3 rounded-lg" style="background-color: var(--brand)"><Plus size={14}/></button>
							</div>
						{/if}

						{#each getGroupBookmarks(group) as b, i (b.id)}
							<div 
                                class="bookmark-row group flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer {compactMode ? 'p-1.5' : 'p-2.5'}" 
                                draggable={isEditMode} 
                                ondragstart={(e) => { e.stopPropagation(); draggedId = b.id; }} 
                                ondragover={(e) => e.preventDefault()} 
                                ondrop={(e) => { e.stopPropagation(); handleDrop(group, i); }} 
                                onclick={() => isEditMode ? openEditModal(b) : window.open(b.url.startsWith('http') ? b.url : `https://${b.url}`)}
                                oncontextmenu={(e) => handleContextMenu(e, b)}
                            >
								<GripVertical size={12} class="text-slate-300 {isEditMode ? 'opacity-100' : 'opacity-0'}" />
								<div class="flex items-center justify-center shrink-0 {compactMode ? 'w-4 h-4' : 'w-5 h-5'}">
                                    {#if b.icon && isSVG(b.icon)}
                                        <div class="w-full h-full flex items-center justify-center text-slate-400">{@html b.icon}</div>
                                    {:else}
                                        <img src={b.icon || `https://www.google.com/s2/favicons?domain=${b.url}`} alt="" class="w-full h-full object-contain grayscale-[0.4] group-hover:grayscale-0 transition-all" />
                                    {/if}
								</div>
								<div class="flex-1 truncate">
                                    <div class="flex justify-between items-center">
                                        <h3 class="text-xs font-normal text-slate-700 dark:text-slate-200 truncate">{b.title}</h3>
                                        <ExternalLink size={10} class="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </div>
                                    {#if !compactMode && (b.tags?.length || b.notes)}
                                        <div class="flex gap-2 items-center mt-0.5">
                                            {#each b.tags || [] as t} <span class="text-[8px] font-normal text-blue-500 uppercase tracking-tight">#{t}</span> {/each}
                                            {#if b.notes} <span class="text-[9px] italic text-slate-400 truncate font-light">{b.notes}</span> {/if}
                                        </div>
                                    {/if}
                                </div>
								{#if isEditMode}
									<button onclick={(e) => { e.stopPropagation(); deleteBookmark(b.id); }} class="text-slate-300 hover:text-red-500"><Trash2 size={12}/></button>
								{/if}
							</div>
						{/each}
					</div>
				</section>
			{/each}
		</main>

        {#if contextMenu.show}
            <div class="fixed z-[200] bg-white dark:bg-slate-900 shadow-xl rounded-xl border dark:border-slate-800 py-1 w-44 text-[11px]" style="top: {contextMenu.y}px; left: {contextMenu.x}px;" onclick={(e) => e.stopPropagation()}>
                <button onclick={() => openEditModal(contextMenu.target!)} class="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"><Edit2 size={12} class="text-blue-500 opacity-70"/> Edit</button>
                <button onclick={() => duplicateBookmark(contextMenu.target!)} class="w-full text-left px-4 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2"><CopyPlus size={12} class="text-purple-500 opacity-70"/> Duplicate</button>
                <div class="h-px bg-slate-100 dark:bg-slate-800 my-1 mx-2"></div>
                <button onclick={() => deleteBookmark(contextMenu.target!.id)} class="w-full text-left px-4 py-2 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-500 flex items-center gap-2"><Trash2 size={12}/> Delete</button>
            </div>
        {/if}

        {#if isSettingsOpen}
			<div class="fixed inset-0 z-[100] flex justify-end">
				<div class="absolute inset-0 bg-black/20" onclick={() => isSettingsOpen = false}></div>
				<div class="relative w-80 bg-white dark:bg-slate-900 h-full p-8 shadow-2xl space-y-6 overflow-y-auto border-l dark:border-slate-800">
                    <div class="flex justify-between items-center pb-4 border-b dark:border-slate-800">
						<h3 class="font-normal text-[10px] uppercase text-slate-400 tracking-widest">Settings</h3>
						<button onclick={() => isSettingsOpen = false}><X size={20}/></button>
					</div>

					<button onclick={() => { isEditMode = !isEditMode; isSettingsOpen = false; }} class="w-full py-4 rounded-2xl border font-normal text-xs transition-all {isEditMode ? 'text-white border-transparent' : 'text-slate-400 border-slate-100 hover:bg-slate-50'}" style={isEditMode ? `background-color: var(--brand)` : ''}>{isEditMode ? 'LOCK INTERFACE' : 'UNLOCK EDITOR'}</button>
                    
                    <div class="space-y-4 pt-4 border-t dark:border-slate-800">
						<label class="text-[10px] font-normal text-slate-400 uppercase tracking-widest">Data Management</label>
						<div class="grid grid-cols-2 gap-2">
							<button onclick={exportJSON} class="flex items-center justify-center gap-2 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg text-[9px] font-normal uppercase border border-slate-100 dark:border-slate-700 hover:bg-slate-100"><Download size={12}/> Backup JSON</button>
							<label class="flex items-center justify-center gap-2 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg text-[9px] font-normal uppercase border border-slate-100 dark:border-slate-700 hover:bg-slate-100 cursor-pointer"><Upload size={12}/> Restore JSON <input type="file" onchange={importJSON} class="hidden"/></label>
                            <label class="col-span-2 flex items-center justify-center gap-2 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg text-[9px] font-normal uppercase border border-slate-100 dark:border-slate-700 hover:bg-slate-100 cursor-pointer"><FileSpreadsheet size={12}/> Import CSV <input type="file" onchange={importCSV} class="hidden"/></label>
						</div>
					</div>

                    <div class="space-y-4 pt-4 border-t dark:border-slate-800">
                        <label class="text-[10px] font-normal text-slate-400 uppercase tracking-widest">Groups</label>
                        <div class="flex gap-2">
                            <input bind:value={newGroupName} placeholder="New..." class="flex-1 bg-slate-50 dark:bg-slate-800 p-2 rounded-lg text-xs outline-none font-light" />
                            <button onclick={() => { if(newGroupName) { groups=[...groups, newGroupName]; newGroupName=""; syncData(); } }} class="text-white p-2 rounded-lg" style="background-color: var(--brand)"><Plus size={18}/></button>
                        </div>
                        <div class="space-y-1">
                            {#each groups as g}
                                <div class="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-800 rounded border border-slate-100 dark:border-slate-700">
                                    <span class="text-[10px] font-normal">{g}</span>
                                    <button onclick={() => deleteGroup(g)} class="text-slate-300 hover:text-red-500"><Trash2 size={13}/></button>
                                </div>
                            {/each}
                        </div>
                    </div>
                </div>
            </div>
        {/if}
	</div>
</div>

<style>
	:global(body) { 
        margin: 0; 
        overflow: hidden; 
        height: 100vh; 
        width: 100vw; 
        font-family: 'Century Gothic', CenturyGothic, AppleGothic, sans-serif;
        font-weight: 300;
    }
	.no-scrollbar::-webkit-scrollbar { display: none; }
    .bookmark-row { 
        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); 
        border-left: 3px solid transparent; 
    }
    .bookmark-row:hover { 
        background-color: rgba(59, 130, 246, 0.04); 
        border-left: 3px solid var(--brand); 
    }
</style>
