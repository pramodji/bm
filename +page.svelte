<script lang="ts">
	import { 
		Plus, Search, Bookmark as BookmarkIcon, Trash2, Edit2, 
		GripVertical, Settings, X, Moon, Sun, Lock, Unlock,
		FileSpreadsheet, Download, Upload, LayoutList, List, Filter, EyeOff,
		SortAsc, SortDesc, Database, ChevronRight, Code, Copy, CopyPlus, FileUp
	} from 'lucide-svelte';
	import { onMount } from 'svelte';

    const API_URL = 'http://localhost:3000/db';

	// --- 1. STATE ---
	interface Bookmark { 
		id: string; title: string; url: string; group: string; position: number;
		tags?: string[]; notes?: string; icon?: string; 
	}

	let bookmarks = $state<Bookmark[]>([]);
	let groups = $state<string[]>([]);
	let appTitle = $state("Dashboard");
    let syncStatus = $state<"loading" | "synced" | "offline">("loading");
    let time = $state(new Date());
    
    let collapsedGroups = $state<Record<string, boolean>>({});
    let groupWidgets = $state<Record<string, string>>({});
    let groupSortDirections = $state<Record<string, 'none' | 'asc' | 'desc'>>({});
    let groupColumns = $state<Record<string, number>>({});

	let searchQuery = $state("");
	let selectedTag = $state<string | null>(null);
	let isSettingsOpen = $state(false);
	let isEditMode = $state(false);
	let isDarkMode = $state(false);
    let showTags = $state(false); 
    let compactMode = $state(true);
	let accentColor = $state("blue"); 
	let columnInputs = $state<Record<string, string>>({}); 
	let draggedId = $state<null | string>(null);
    let draggedGroup = $state<null | string>(null); 
    let newGroupName = $state("");
    let widgetEditTarget = $state<string | null>(null);
    let editingGroupName = $state<string | null>(null);
    let tempGroupName = $state("");
    let draggedSettingsGroup = $state<string | null>(null);
    let addGroupAfter = $state<string | null>(null);
    let newSubGroupName = $state<Record<string, string>>({});

	let isEditModalOpen = $state(false);
	let activeBookmark = $state<Bookmark | null>(null);
	let contextMenu = $state<{ x: number, y: number, show: boolean, target: Bookmark | null }>({ x: 0, y: 0, show: false, target: null });

	let tempTitle = $state(""), tempUrl = $state(""), tempTags = $state(""), tempNotes = $state(""), tempIcon = $state("");

	const themeMap: Record<string, string> = {
		blue: "#2563eb", emerald: "#10b981", purple: "#8b5cf6", rose: "#f43f5e", amber: "#f59e0b"
	};

    const isSVG = (str: string) => str?.trim().startsWith('<svg') || str?.trim().startsWith('<i ');

	// --- 2. LIFECYCLE ---
	onMount(async () => {
        const timer = setInterval(() => { time = new Date(); }, 1000);
		isDarkMode = localStorage.getItem('mk_dark') === 'true';
		accentColor = localStorage.getItem('mk_accent') || "blue";

		await loadData();
        window.addEventListener('click', () => { contextMenu.show = false; });
        return () => { clearInterval(timer); };
	});

    $effect(() => {
        document.title = appTitle;
        if (isDarkMode) document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
    });

	// --- 3. DATA PERSISTENCE ---
	async function loadData() {
        syncStatus = "loading";
        try {
            const res = await fetch(API_URL);
            if (!res.ok) throw new Error();
            const data = await res.json();
            bookmarks = (data.bookmarks || []).sort((a: Bookmark, b: Bookmark) => a.position - b.position);
            groups = data.groups || ["General"];
            groupSortDirections = data.sorts || {};
            collapsedGroups = data.collapsed || {};
            groupWidgets = data.widgets || {};
            groupColumns = data.columns || {};
            syncStatus = "synced";
        } catch (e) {
            syncStatus = "offline";
            groups = JSON.parse(localStorage.getItem('mk_groups') || '["General"]');
            groupSortDirections = JSON.parse(localStorage.getItem('mk_sorts') || '{}');
            collapsedGroups = JSON.parse(localStorage.getItem('mk_collapsed') || '{}');
            groupWidgets = JSON.parse(localStorage.getItem('mk_widgets') || '{}');
            groupColumns = JSON.parse(localStorage.getItem('mk_columns') || '{}');
            bookmarks = JSON.parse(localStorage.getItem('mk_bookmarks') || '[]').sort((a: any, b: any) => a.position - b.position);
        }
	}

	async function syncData() {
		localStorage.setItem('mk_groups', JSON.stringify(groups));
		localStorage.setItem('mk_bookmarks', JSON.stringify(bookmarks));
        localStorage.setItem('mk_sorts', JSON.stringify(groupSortDirections));
        localStorage.setItem('mk_collapsed', JSON.stringify(collapsedGroups));
        localStorage.setItem('mk_widgets', JSON.stringify(groupWidgets));
        localStorage.setItem('mk_columns', JSON.stringify(groupColumns));
        localStorage.setItem('mk_accent', accentColor);
        try {
            const res = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ bookmarks, groups, sorts: groupSortDirections, collapsed: collapsedGroups, widgets: groupWidgets, columns: groupColumns, appTitle })
            });
            syncStatus = res.ok ? "synced" : "offline";
        } catch (e) { syncStatus = "offline"; }
	}

	// --- 4. CORE LOGIC ---
    
    // Logic to move a Bookmark to a new group/position
    function handleDrop(targetGroup: string, targetIndex: number) {
		if (!draggedId) return;
        
        // Reset sort for target group to manual when moving items
        groupSortDirections[targetGroup] = 'none';

		const movedItem = bookmarks.find(b => b.id === draggedId);
		if (!movedItem) return;

        // Filter out the moved item from everywhere else
		let otherBookmarks = bookmarks.filter(b => b.id !== draggedId);
        
        // Find items already in the target group
		let itemsInTarget = otherBookmarks.filter(b => b.group === targetGroup).sort((a,b) => a.position - b.position);
        
        // Update the group name of the moved item
        const updatedItem = { ...movedItem, group: targetGroup };

        // Insert into the target array at specific index
		itemsInTarget.splice(targetIndex, 0, updatedItem);

        // Reconstruct the full list and re-index positions
        const rest = otherBookmarks.filter(b => b.group !== targetGroup);
        bookmarks = [...rest, ...itemsInTarget].map((b, i) => ({...b, position: i}));
		
        draggedId = null; 
        syncData();
	}

    // Logic to reorder Groups
    function handleGroupDrop(targetGroupName: string, event?: DragEvent) {
        if (!draggedGroup || draggedGroup === targetGroupName) return;

        const fromIndex = groups.indexOf(draggedGroup);
        const toIndex = groups.indexOf(targetGroupName);
        const updatedGroups = [...groups];
        updatedGroups.splice(fromIndex, 1);
        
        // Determine if dropping before or after based on mouse position
        let insertIndex = toIndex;
        if (event) {
            const target = event.currentTarget as HTMLElement;
            const rect = target.getBoundingClientRect();
            const midpoint = rect.top + rect.height / 2;
            if (event.clientY > midpoint) {
                // Drop after
                insertIndex = toIndex >= fromIndex ? toIndex : toIndex + 1;
            } else {
                // Drop before
                insertIndex = toIndex > fromIndex ? toIndex - 1 : toIndex;
            }
        } else {
            insertIndex = toIndex;
        }
        
        updatedGroups.splice(insertIndex, 0, draggedGroup);
        groups = updatedGroups;
        draggedGroup = null;
        syncData();
    }

    function handleImportJSON(file: File) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const content = ev.target?.result;
                if (typeof content !== 'string') return;
                const data = JSON.parse(content);
                if (data.bookmarks) bookmarks = data.bookmarks;
                if (data.groups) groups = data.groups;
                if (data.sorts) groupSortDirections = data.sorts;
                if (data.collapsed) collapsedGroups = data.collapsed;
                if (data.widgets) groupWidgets = data.widgets;
                syncData();
                alert("Import Successful");
            } catch (err) { alert("Invalid JSON file"); }
        };
        reader.readAsText(file);
    }

    function handleCSVImport(file: File) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            const content = ev.target?.result;
            if (typeof content !== 'string') return;
            const lines = content.split('\n');
            const newBookmarks: Bookmark[] = [];
            lines.forEach(line => {
                const parts = line.split(',');
                if (parts.length >= 2) {
                    const title = parts[0].trim();
                    const url = parts[1].trim();
                    if (title && url) {
                        newBookmarks.push({
                            id: crypto.randomUUID(),
                            title: title,
                            url: url.startsWith('http') ? url : `https://${url}`,
                            group: groups[0] || "General",
                            position: bookmarks.length + newBookmarks.length
                        });
                    }
                }
            });
            bookmarks = [...bookmarks, ...newBookmarks];
            syncData();
            alert(`Imported ${newBookmarks.length} items.`);
        };
        reader.readAsText(file);
    }

    function handleIconUpload(file: File) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            tempIcon = ev.target?.result as string;
        };
        reader.readAsDataURL(file);
    }

    function duplicateBookmark(bookmark: Bookmark) {
        const newBM = { ...bookmark, id: crypto.randomUUID(), position: bookmarks.length };
        bookmarks = [...bookmarks, newBM];
        syncData();
        contextMenu.show = false;
    }

    async function copyToClipboard(text: string) {
        await navigator.clipboard.writeText(text);
        contextMenu.show = false;
    }

    function toggleCollapse(groupName: string) {
        collapsedGroups[groupName] = !collapsedGroups[groupName];
        syncData();
    }

    function toggleSort(groupName: string) {
        const current = groupSortDirections[groupName] || 'none';
        groupSortDirections[groupName] = current === 'none' ? 'asc' : current === 'asc' ? 'desc' : 'none';
        syncData();
    }

    function addBookmarkToGroup(group: string) {
        const url = columnInputs[group];
        if (!url) return;
        bookmarks = [...bookmarks, { 
            id: crypto.randomUUID(), title: url.split('/')[2] || url, 
            url: url.startsWith('http') ? url : `https://${url}`, 
            group, position: bookmarks.length, tags: [], notes: "", icon: "" 
        }];
        columnInputs[group] = "";
        syncData();
    }

    function renameGroup(oldName: string, newName: string) {
        if (!newName || newName === oldName) return;
        groups = groups.map(g => g === oldName ? newName : g);
        bookmarks = bookmarks.map(b => b.group === oldName ? {...b, group: newName} : b);
        if (groupSortDirections[oldName]) {
            groupSortDirections[newName] = groupSortDirections[oldName];
            delete groupSortDirections[oldName];
        }
        if (collapsedGroups[oldName]) {
            collapsedGroups[newName] = collapsedGroups[oldName];
            delete collapsedGroups[oldName];
        }
        if (groupWidgets[oldName]) {
            groupWidgets[newName] = groupWidgets[oldName];
            delete groupWidgets[oldName];
        }
        if (groupColumns[oldName] !== undefined) {
            groupColumns[newName] = groupColumns[oldName];
            delete groupColumns[oldName];
        }
        syncData();
    }

    function deleteGroup(groupName: string) {
        const count = bookmarks.filter(b => b.group === groupName).length;
        if (count > 0 && !confirm(`Delete "${groupName}" and its ${count} bookmark(s)?`)) return;
        groups = groups.filter(g => g !== groupName);
        bookmarks = bookmarks.filter(b => b.group !== groupName);
        delete groupSortDirections[groupName];
        delete collapsedGroups[groupName];
        delete groupWidgets[groupName];
        delete groupColumns[groupName];
        syncData();
    }

    function reorderGroupInSettings(targetGroup: string, position: 'before' | 'after') {
        if (!draggedSettingsGroup || draggedSettingsGroup === targetGroup) return;
        const fromIndex = groups.indexOf(draggedSettingsGroup);
        const toIndex = groups.indexOf(targetGroup);
        const updatedGroups = [...groups];
        updatedGroups.splice(fromIndex, 1);
        const insertIndex = position === 'after' ? (toIndex >= fromIndex ? toIndex : toIndex + 1) : (toIndex > fromIndex ? toIndex - 1 : toIndex);
        updatedGroups.splice(insertIndex, 0, draggedSettingsGroup);
        groups = updatedGroups;
        draggedSettingsGroup = null;
        syncData();
    }

    function addGroupAfterTarget(targetGroup: string, newName: string) {
        if (!newName) return;
        const targetIndex = groups.indexOf(targetGroup);
        const updatedGroups = [...groups];
        updatedGroups.splice(targetIndex + 1, 0, newName);
        groups = updatedGroups;
        newSubGroupName[targetGroup] = "";
        addGroupAfter = null;
        syncData();
    }

	// --- 5. DERIVED ---
    let allTags = $derived(Array.from(new Set(bookmarks.flatMap(b => b.tags || []))).sort());

    let columnGroups = $derived.by(() => {
        const cols: Record<number, string[]> = {};
        groups.forEach(g => {
            const col = groupColumns[g] ?? 1;
            if (!cols[col]) cols[col] = [];
            cols[col].push(g);
        });
        return cols;
    });

    let usedColumns = $derived(Object.keys(columnGroups).map(Number).sort((a, b) => a - b));

	let filteredBookmarks = $derived(bookmarks.filter(b => {
		const matchesSearch = b.title.toLowerCase().includes(searchQuery.toLowerCase()) || b.notes?.toLowerCase().includes(searchQuery.toLowerCase());
		const matchesTag = !selectedTag || b.tags?.includes(selectedTag);
		return matchesSearch && matchesTag;
	}));

    function getGroupBookmarks(groupName: string) {
        let items = filteredBookmarks.filter(b => b.group === groupName);
        const dir = groupSortDirections[groupName] || 'none';
        if (dir === 'asc') return items.sort((a, b) => a.title.localeCompare(b.title));
        if (dir === 'desc') return items.sort((a, b) => b.title.localeCompare(a.title));
        return items.sort((a, b) => a.position - b.position);
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
</script>

<div class="h-screen w-screen flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 transition-colors font-light" style="--brand: {themeMap[accentColor]}">
	
	<header class="h-14 bg-white dark:bg-slate-900 border-b dark:border-slate-800 flex items-center px-4 justify-between shrink-0 z-20 shadow-sm">
		<div class="flex items-center gap-4 flex-1">
			<div class="flex items-center gap-2 font-bold uppercase tracking-tighter text-sm" style="color: var(--brand)">
				<BookmarkIcon size={20} fill="currentColor" fill-opacity="0.2" /> <span class="font-bold">Bookmark Manager</span>
			</div>
            
            <div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border transition-all
                {syncStatus === 'synced' ? 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20' : 
                 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-500/10 dark:border-amber-500/20'}">
                <Database size={10} /> <span>{syncStatus}</span>
            </div>

            <button onclick={() => isEditMode = !isEditMode} class="flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all {isEditMode ? 'bg-amber-500 text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200'}">
                {#if isEditMode}<Unlock size={14}/> Unlock{:else}<Lock size={14}/> Lock{/if}
            </button>
            <button onclick={() => showTags = !showTags} class="flex items-center gap-2 px-3 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all {showTags ? 'bg-blue-500 text-white shadow-lg' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200'}">
                {#if showTags}<EyeOff size={14}/>{:else}<LayoutList size={14}/>{/if} Tags
            </button>
		</div>

		<div class="flex items-center gap-2 flex-[2] justify-center">
            <div class="relative w-[500px] flex items-center gap-2">
                <div class="relative flex-1">
                    <Search class="absolute left-4 top-3 text-slate-400" size={16} />
                    <input bind:value={searchQuery} placeholder="Search bookmarks..." class="w-full pl-12 pr-4 py-3 text-sm bg-slate-100 dark:bg-slate-800 border-none rounded-2xl outline-none focus:ring-2 focus:ring-blue-500/20" />
                </div>
                {#if allTags.length > 0}
                    <select bind:value={selectedTag} class="px-3 py-3 text-xs bg-slate-100 dark:bg-slate-800 border-none rounded-2xl outline-none">
                        <option value={null}>All Tags</option>
                        {#each allTags as tag}
                            <option value={tag}>{tag}</option>
                        {/each}
                    </select>
                {/if}
            </div>
        </div>

		<div class="flex items-center gap-6 flex-1 justify-end">
            <div class="text-xl font-mono font-medium text-slate-700 dark:text-slate-200 tabular-nums uppercase">
                {time.toLocaleTimeString([], { hour12: true, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </div>
            <button onclick={() => isSettingsOpen = true} class="p-2 text-slate-400 hover:text-slate-600"><Settings size={20}/></button>
		</div>
	</header>

	<main class="flex-1 p-6 overflow-y-auto grid gap-8 items-start content-start" style="grid-template-columns: repeat({usedColumns.length}, minmax(0, 1fr));">
		{#each usedColumns as colNum}
			<div class="flex flex-col gap-8">
			{#each columnGroups[Number(colNum)] as group, idx}
			<section class="flex flex-col min-h-[40px] relative" 
                ondragover={(e) => e.preventDefault()} 
                ondrop={(e) => {
                    if (draggedGroup) handleGroupDrop(group, e);
                    else if (draggedId) handleDrop(group, getGroupBookmarks(group).length);
                }}>
				
                <div class="flex items-center justify-between mb-3 px-1 group-header" 
                    draggable={isEditMode} 
                    ondragstart={() => (draggedGroup = group)}
                    ondragover={(e) => e.preventDefault()}
                    ondrop={(e) => { e.stopPropagation(); if (draggedGroup) handleGroupDrop(group, e); }}>
                    
                    <div class="flex items-center gap-3">
                        <button onclick={() => toggleCollapse(group)} class="flex items-center gap-2 group/title">
                            <ChevronRight size={12} class="text-slate-400 transition-transform duration-200 {collapsedGroups[group] ? '' : 'rotate-90'}" />
                            <h2 class="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] group-hover/title:text-slate-600 transition-colors">{group}</h2>
                        </button>
                        
                        <button onclick={() => toggleSort(group)} class="p-1.5 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-lg">
                            {#if groupSortDirections[group] === 'asc'} <SortAsc size={14} class="text-blue-500" />
                            {:else if groupSortDirections[group] === 'desc'} <SortDesc size={14} class="text-blue-500" />
                            {:else} <SortAsc size={14} class="text-slate-300" /> {/if}
                        </button>

                        {#if isEditMode}
                            <button onclick={() => widgetEditTarget = group} class="text-slate-300 hover:text-blue-500 transition-colors">
                                <Code size={13} />
                            </button>
                            <button onclick={() => { if(confirm(`Delete ${group}?`)) { groups = groups.filter(g => g !== group); syncData(); }}} class="text-slate-300 hover:text-red-500 transition-colors">
                                <Trash2 size={13} />
                            </button>
                        {/if}
                    </div>
				</div>

				<div class="bg-white dark:bg-slate-900 rounded-[1.5rem] shadow-lg ring-1 ring-slate-200 dark:ring-slate-800 overflow-hidden divide-y dark:divide-slate-800 transition-all duration-300 hover:ring-2 hover:ring-blue-300 dark:hover:ring-blue-700 {collapsedGroups[group] ? 'max-h-0 opacity-0 invisible' : 'max-h-[2000px] opacity-100 visible'}">
                    {#if isEditMode}
						<div class="p-3 bg-slate-50 dark:bg-slate-800/50 flex gap-2">
							<input bind:value={columnInputs[group]} placeholder="Quick add URL..." class="flex-1 text-sm p-3 bg-white dark:bg-slate-900 rounded-xl border dark:border-slate-700 outline-none" onkeydown={(e) => e.key === 'Enter' && addBookmarkToGroup(group)} />
							<button onclick={() => addBookmarkToGroup(group)} class="text-white px-4 rounded-xl" style="background-color: var(--brand)"><Plus size={18}/></button>
						</div>
					{/if}

                    {#each getGroupBookmarks(group) as b, i (b.id)}
						<div 
							class="bookmark-row group flex items-center gap-2.5 {compactMode ? 'py-1.5 px-3' : 'p-3.5'} hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer" 
							draggable={isEditMode} 
                            ondragstart={() => (draggedId = b.id)} 
                            ondrop={(e) => { e.stopPropagation(); handleDrop(group, i); }}
							onclick={() => isEditMode ? openEditModal(b) : window.open(b.url.startsWith('http') ? b.url : `https://${b.url}`)}
							oncontextmenu={(e) => { e.preventDefault(); contextMenu = { x: e.clientX, y: e.clientY, show: true, target: b }; }}
						>
							<GripVertical size={14} class="text-slate-300 {isEditMode ? 'opacity-100' : 'opacity-0'} shrink-0" />
                            <div class="w-4 h-4 flex items-center justify-center shrink-0">
                                {#if b.icon && isSVG(b.icon)}
                                    <div class="w-full h-full flex items-center justify-center text-slate-400">{@html b.icon}</div>
                                {:else}
                                    <img src={b.icon || `https://www.google.com/s2/favicons?domain=${b.url}`} alt="" class="w-full h-full object-contain grayscale-[0.3] group-hover:grayscale-0 transition-all" />
                                {/if}
                            </div>
							<div class="flex-1 truncate">
                                <div class="text-[13px] font-medium truncate text-slate-700 dark:text-slate-200 leading-tight">{b.title}</div>
                                {#if showTags && b.tags?.length}
                                    <div class="flex gap-1 mt-1">
                                        {#each b.tags as tag}<span class="text-[9px] px-1.5 py-0.5 bg-slate-100 dark:bg-slate-700 rounded text-slate-500">{tag}</span>{/each}
                                    </div>
                                {/if}
                            </div>
						</div>
					{/each}

                    {#if groupWidgets[group]}
                        <div class="p-4 bg-slate-50/50 dark:bg-slate-800/20 border-t dark:border-slate-800 overflow-hidden">
                            {@html groupWidgets[group]}
                        </div>
                    {/if}
				</div>

                {#if isEditMode && draggedGroup && draggedGroup !== group}
                    <div 
                        class="h-8 mt-2 rounded-lg border-2 border-dashed border-blue-400 bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-[9px] text-blue-600 dark:text-blue-400 font-bold uppercase tracking-wider opacity-0 hover:opacity-100 transition-opacity"
                        ondragover={(e) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.style.opacity = '1'; }}
                        ondragleave={(e) => { e.currentTarget.style.opacity = '0'; }}
                        ondrop={(e) => { 
                            e.stopPropagation(); 
                            const fromIndex = groups.indexOf(draggedGroup!);
                            const toIndex = groups.indexOf(group);
                            const updatedGroups = [...groups];
                            updatedGroups.splice(fromIndex, 1);
                            // Always insert after the target group
                            const insertIndex = fromIndex < toIndex ? toIndex : toIndex + 1;
                            updatedGroups.splice(insertIndex, 0, draggedGroup!);
                            groups = updatedGroups;
                            draggedGroup = null;
                            syncData();
                        }}
                    >
                        Drop here to place underneath
                    </div>
                {/if}
			</section>
			{/each}
			</div>
		{/each}
	</main>

	{#if isSettingsOpen}
		<div class="fixed inset-0 z-[100] flex justify-end">
			<div class="absolute inset-0 bg-black/40 backdrop-blur-sm" onclick={() => isSettingsOpen = false}></div>
			<div class="relative w-80 bg-white dark:bg-slate-900 h-full p-8 shadow-2xl border-l dark:border-slate-800 overflow-y-auto space-y-8">
				<div class="flex justify-between items-center border-b dark:border-slate-800 pb-4">
					<h3 class="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Settings</h3>
					<button onclick={() => isSettingsOpen = false}><X/></button>
				</div>

                <div class="space-y-4 pt-4 border-t dark:border-slate-800">
                    <label class="text-[10px] font-bold uppercase text-slate-400 block">Manage Groups</label>
                    <div class="flex gap-2 mb-3">
                        <input bind:value={newGroupName} placeholder="New Group Name..." class="flex-1 bg-slate-100 dark:bg-slate-800 p-3 rounded-xl text-xs outline-none" onkeydown={(e) => {if(e.key === 'Enter' && newGroupName) { groups = [...groups, newGroupName]; newGroupName = ""; syncData(); }}} />
                        <button onclick={() => { if(newGroupName) { groups = [...groups, newGroupName]; newGroupName = ""; syncData(); }}} class="p-3 bg-blue-500 text-white rounded-xl"><Plus size={16}/></button>
                    </div>
                    <div class="space-y-2 max-h-48 overflow-y-auto">
                        {#each groups as group, idx}
                            <div 
                                class="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg group/item cursor-move relative"
                                draggable={editingGroupName !== group}
                                ondragstart={() => draggedSettingsGroup = group}
                                ondragover={(e) => e.preventDefault()}
                                ondrop={(e) => {
                                    e.stopPropagation();
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const midpoint = rect.top + rect.height / 2;
                                    reorderGroupInSettings(group, e.clientY > midpoint ? 'after' : 'before');
                                }}
                            >
                                <GripVertical size={12} class="text-slate-300 shrink-0" />
                                {#if editingGroupName === group}
                                    <input bind:value={tempGroupName} class="flex-1 bg-white dark:bg-slate-900 px-2 py-1 rounded text-xs outline-none" onkeydown={(e) => { if(e.key === 'Enter') { renameGroup(group, tempGroupName); editingGroupName = null; } else if(e.key === 'Escape') { editingGroupName = null; }}} />
                                    <button onclick={() => { renameGroup(group, tempGroupName); editingGroupName = null; }} class="p-1 text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"><Edit2 size={14}/></button>
                                {:else}
                                    <span class="flex-1 text-xs px-2">{group}</span>
                                    <select bind:value={groupColumns[group]} onchange={() => syncData()} class="text-[10px] px-1 py-0.5 bg-white dark:bg-slate-900 rounded border dark:border-slate-700">
                                        {#each Array.from({length: 5}, (_, i) => i + 1) as col}
                                            <option value={col}>Col {col}</option>
                                        {/each}
                                    </select>
                                    <button onclick={() => addGroupAfter = group} class="p-1 text-slate-400 hover:text-green-500 opacity-0 group-hover/item:opacity-100 transition-opacity" title="Add group below"><Plus size={14}/></button>
                                    <button onclick={() => { editingGroupName = group; tempGroupName = group; }} class="p-1 text-slate-400 hover:text-blue-500 opacity-0 group-hover/item:opacity-100 transition-opacity"><Edit2 size={14}/></button>
                                    <button onclick={() => deleteGroup(group)} class="p-1 text-slate-400 hover:text-red-500 opacity-0 group-hover/item:opacity-100 transition-opacity"><Trash2 size={14}/></button>
                                {/if}
                            </div>
                            {#if addGroupAfter === group}
                                <div class="flex items-center gap-2 ml-6 p-2 bg-white dark:bg-slate-900 rounded-lg border-2 border-blue-500">
                                    <input bind:value={newSubGroupName[group]} placeholder="New group name..." class="flex-1 px-2 py-1 rounded text-xs outline-none bg-slate-50 dark:bg-slate-800" onkeydown={(e) => { if(e.key === 'Enter') addGroupAfterTarget(group, newSubGroupName[group]); else if(e.key === 'Escape') addGroupAfter = null; }} />
                                    <button onclick={() => addGroupAfterTarget(group, newSubGroupName[group])} class="p-1 text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 rounded"><Plus size={14}/></button>
                                    <button onclick={() => addGroupAfter = null} class="p-1 text-slate-400 hover:text-red-500 rounded"><X size={14}/></button>
                                </div>
                            {/if}
                        {/each}
                    </div>
                </div>

                <div class="space-y-4 pt-4 border-t dark:border-slate-800">
                    <label class="text-[10px] font-bold uppercase text-slate-400 block">Imports & Exports</label>
                    <div class="flex flex-col gap-2">
                        <label class="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl text-xs hover:bg-slate-100 font-medium cursor-pointer">
                            <span>Import JSON</span> <FileUp size={16}/>
                            <input type="file" accept=".json" class="hidden" onchange={(e) => e.currentTarget.files && handleImportJSON(e.currentTarget.files[0])} />
                        </label>
                        <label class="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl text-xs hover:bg-slate-100 font-medium cursor-pointer">
                            <span>Import CSV</span> <FileSpreadsheet size={16}/>
                            <input type="file" accept=".csv" class="hidden" onchange={(e) => e.currentTarget.files && handleCSVImport(e.currentTarget.files[0])} />
                        </label>
                        <button onclick={() => {
                            const data = { groups, bookmarks, sorts: groupSortDirections, collapsed: collapsedGroups, widgets: groupWidgets, columns: groupColumns };
                            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                            const a = document.createElement('a'); 
                            a.href = URL.createObjectURL(blob); 
                            a.download = 'backup.json'; 
                            a.click();
                        }} class="w-full flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800 rounded-2xl text-xs hover:bg-slate-100 font-medium">
                            <span>Export JSON</span> <Download size={16}/>
                        </button>
                    </div>
                </div>
			</div>
		</div>
	{/if}

    {#if contextMenu.show}
		<div class="fixed z-[200] bg-white dark:bg-slate-900 shadow-2xl rounded-2xl border dark:border-slate-800 py-1.5 w-48 text-[11px]" style="top: {contextMenu.y}px; left: {contextMenu.x}px;" onclick={(e) => e.stopPropagation()}>
			<button onclick={() => openEditModal(contextMenu.target!)} class="w-full text-left px-4 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-3 transition-colors"><Edit2 size={14} class="text-blue-500"/> Edit Properties</button>
            <button onclick={() => duplicateBookmark(contextMenu.target!)} class="w-full text-left px-4 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-3 transition-colors"><CopyPlus size={14} class="text-emerald-500"/> Duplicate</button>
            <button onclick={() => copyToClipboard(contextMenu.target!.url)} class="w-full text-left px-4 py-2.5 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-3 transition-colors"><Copy size={14} class="text-amber-500"/> Copy URL</button>
			<button onclick={() => { bookmarks = bookmarks.filter(b => b.id !== contextMenu.target!.id); syncData(); contextMenu.show = false; }} class="w-full text-left px-4 py-2.5 hover:bg-red-50 text-red-500 flex items-center gap-3 transition-colors"><Trash2 size={14}/> Delete</button>
		</div>
	{/if}

    {#if isEditModalOpen}
		<div class="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
			<div class="bg-white dark:bg-slate-900 w-full max-w-md rounded-[2.5rem] p-10 space-y-4 shadow-2xl overflow-y-auto max-h-[90vh]">
                <div class="flex justify-between border-b dark:border-slate-800 pb-4">
				    <h3 class="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">Properties</h3>
                    <button onclick={() => isEditModalOpen = false}><X size={20}/></button>
                </div>
				<div class="space-y-1">
                    <label class="text-[9px] font-bold uppercase text-slate-400 ml-2">Title</label>
                    <input bind:value={tempTitle} class="w-full bg-slate-50 dark:bg-slate-800 p-3 rounded-2xl text-[13px] outline-none" />
                </div>
                <div class="space-y-1">
                    <label class="text-[9px] font-bold uppercase text-slate-400 ml-2">URL</label>
                    <input bind:value={tempUrl} class="w-full bg-slate-50 dark:bg-slate-800 p-3 rounded-2xl text-[13px] outline-none" />
                </div>
                <div class="space-y-1">
                    <label class="text-[9px] font-bold uppercase text-slate-400 ml-2">Icon</label>
                    <div class="flex gap-2">
                        <input bind:value={tempIcon} placeholder="SVG code or URL" class="flex-1 bg-slate-50 dark:bg-slate-800 p-3 rounded-2xl text-[13px] outline-none" />
                        <label class="px-4 py-3 bg-slate-50 dark:bg-slate-800 rounded-2xl cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center">
                            <Upload size={16} />
                            <input type="file" accept="image/*" class="hidden" onchange={(e) => e.currentTarget.files && handleIconUpload(e.currentTarget.files[0])} />
                        </label>
                    </div>
                </div>
                <div class="space-y-1">
                    <label class="text-[9px] font-bold uppercase text-slate-400 ml-2">Tags</label>
                    <input bind:value={tempTags} placeholder="tag1, tag2, tag3" class="w-full bg-slate-50 dark:bg-slate-800 p-3 rounded-2xl text-[13px] outline-none" />
                </div>
                <div class="space-y-1">
                    <label class="text-[9px] font-bold uppercase text-slate-400 ml-2">Notes</label>
                    <textarea bind:value={tempNotes} placeholder="Add notes..." class="w-full bg-slate-50 dark:bg-slate-800 p-3 rounded-2xl text-[13px] outline-none resize-none" rows="3"></textarea>
                </div>
				<button onclick={savePopupChanges} class="w-full py-4 rounded-2xl font-black text-white uppercase tracking-[0.2em] shadow-xl mt-4" style="background-color: var(--brand)">Update</button>
			</div>
		</div>
	{/if}
</div>

<style>
	:global(body) { margin: 0; padding: 0; overflow: hidden; font-family: 'Century Gothic', sans-serif; }
    .bookmark-row { border-left: 3px solid transparent; transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1); }
    .bookmark-row:hover { border-left: 3px solid var(--brand); }
    .group-header { cursor: grab; }
    .group-header:active { cursor: grabbing; }
    ::-webkit-scrollbar { display: none; }
</style>
