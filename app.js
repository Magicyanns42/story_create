(() => {
  'use strict';

  const input = document.getElementById('photo-input');
  const grid = document.getElementById('story-grid');
  const emptyPreview = document.getElementById('empty-preview');
  const list = document.getElementById('photo-list');
  const gallery = document.getElementById('gallery-section');
  const count = document.getElementById('photo-count');
  const caption = document.getElementById('preview-caption');
  const exportButton = document.getElementById('export-button');
  const editor = document.getElementById('editor-section');
  const templateSelect = document.getElementById('template-select');
  const filterSelect = document.getElementById('filter-select');
  const textInput = document.getElementById('text-input');
  const cropRangeX = document.getElementById('crop-range-x');
  const cropRangeY = document.getElementById('crop-range-y');
  const toast = document.getElementById('toast');
  const installButton = document.getElementById('install-button');
  let photos = [];
  let selectedIndex = 0;
  let template = 'grid';
  let filter = 'none';
  let overlayText = '';
  let sticker = '';
  let draggedIndex = null;
  let deferredInstall = null;

  const FILTERS = {
    none: 'none',
    soft: 'brightness(1.08) saturate(.82)',
    mono: 'grayscale(1)',
    warm: 'sepia(.35) saturate(1.35)',
    vivid: 'saturate(1.55) contrast(1.08)',
  };

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstall = event;
    installButton.hidden = false;
  });
  installButton.addEventListener('click', async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    installButton.hidden = true;
  });

  input.addEventListener('change', event => {
    const incoming = [...event.target.files].map(file => ({ file, url: URL.createObjectURL(file), cropX: 50, cropY: 50 }));
    photos.push(...incoming);
    selectedIndex = Math.max(0, photos.length - incoming.length);
    input.value = '';
    render();
  });

  exportButton.addEventListener('click', exportStory);
  templateSelect.addEventListener('change', event => { template = event.target.value; renderPreview(); });
  filterSelect.addEventListener('change', event => { filter = event.target.value; renderPreview(); });
  textInput.addEventListener('input', event => { overlayText = event.target.value; renderPreview(); });
  cropRangeX.addEventListener('input', event => {
    if (!photos[selectedIndex]) return;
    photos[selectedIndex].cropX = Number(event.target.value);
    renderPreview();
  });
  cropRangeY.addEventListener('input', event => {
    if (!photos[selectedIndex]) return;
    photos[selectedIndex].cropY = Number(event.target.value);
    renderPreview();
  });
  document.querySelectorAll('[data-sticker]').forEach(button => button.addEventListener('click', () => {
    sticker = button.dataset.sticker;
    document.querySelectorAll('[data-sticker]').forEach(item => item.classList.toggle('active', item === button));
    renderPreview();
  }));

  function render() {
    const hasPhotos = photos.length > 0;
    emptyPreview.hidden = hasPhotos;
    grid.hidden = !hasPhotos;
    gallery.hidden = !hasPhotos;
    editor.hidden = !hasPhotos;
    exportButton.disabled = !hasPhotos;
    count.textContent = photos.length;
    caption.textContent = hasPhotos
      ? `${photos.length} photo${photos.length > 1 ? 's' : ''} · aperçu du montage`
      : 'Ajoute au moins une photo pour commencer';
    renderPreview();
    renderGallery();
  }

  function renderPreview() {
    if (!photos.length) return;
    grid.className = `story-grid template-${template} ${photos.length === 1 ? 'single' : ''}`;
    const columns = template === 'strip' || photos.length === 1 ? 1 : 2;
    grid.style.gridTemplateColumns = `repeat(${columns}, 1fr)`;
    grid.innerHTML = photos.map(photo => `<div class="story-cell"><img src="${photo.url}" alt="" style="object-position:${photo.cropX ?? 50}% ${photo.cropY ?? 50}%;filter:${FILTERS[filter]}"></div>`).join('');
    grid.insertAdjacentHTML('beforeend', `<div class="story-overlay">${overlayText ? `<div class="overlay-text">${escapeHtml(overlayText)}</div>` : ''}${sticker ? `<div class="overlay-sticker">${sticker}</div>` : ''}</div>`);
  }

  function renderGallery() {
    list.innerHTML = photos.map((photo, index) => `
      <div class="photo-card ${index === selectedIndex ? 'selected' : ''}" data-index="${index}" draggable="true">
        <img src="${photo.url}" alt="Photo ${index + 1}" style="object-position:${photo.cropX ?? 50}% ${photo.cropY ?? 50}%;filter:${FILTERS[filter]}">
        <span class="photo-index">${index + 1}</span>
        <button class="remove-photo" type="button" data-remove="${index}" aria-label="Supprimer la photo ${index + 1}">×</button>
        <div class="photo-actions" aria-label="Déplacer la photo">
          <button class="move-photo" type="button" data-move="-1" data-index="${index}" aria-label="Déplacer vers la gauche">←</button>
          <button class="move-photo" type="button" data-move="1" data-index="${index}" aria-label="Déplacer vers la droite">→</button>
        </div>
      </div>`).join('');
    list.querySelectorAll('.photo-card').forEach(card => card.addEventListener('click', () => {
      selectedIndex = Number(card.dataset.index);
      cropRangeX.value = photos[selectedIndex].cropX ?? 50;
      cropRangeY.value = photos[selectedIndex].cropY ?? 50;
      renderGallery();
    }));
    list.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', event => {
      event.stopPropagation();
      removePhoto(Number(button.dataset.remove));
    }));
    list.querySelectorAll('[data-move]').forEach(button => button.addEventListener('click', event => {
      event.stopPropagation();
      const from = Number(button.dataset.index);
      const to = from + Number(button.dataset.move);
      if (to < 0 || to >= photos.length) return;
      [photos[from], photos[to]] = [photos[to], photos[from]];
      selectedIndex = to;
      render();
    }));
    list.querySelectorAll('.photo-card').forEach(card => {
      card.addEventListener('dragstart', () => { draggedIndex = Number(card.dataset.index); card.classList.add('dragging'); });
      card.addEventListener('dragend', () => { draggedIndex = null; card.classList.remove('dragging'); });
      card.addEventListener('dragover', event => event.preventDefault());
      card.addEventListener('drop', event => {
        event.preventDefault();
        const targetIndex = Number(card.dataset.index);
        if (draggedIndex === null || draggedIndex === targetIndex) return;
        const [moved] = photos.splice(draggedIndex, 1);
        photos.splice(targetIndex, 0, moved);
        selectedIndex = targetIndex;
        render();
      });
    });
  }

  function removePhoto(index) {
    URL.revokeObjectURL(photos[index].url);
    photos.splice(index, 1);
    selectedIndex = Math.min(selectedIndex, Math.max(0, photos.length - 1));
    cropRangeX.value = photos[selectedIndex]?.cropX ?? 50;
    cropRangeY.value = photos[selectedIndex]?.cropY ?? 50;
    render();
  }

  async function exportStory() {
    if (!photos.length) return;
    exportButton.disabled = true;
    showToast('Préparation de ta story…');
    try {
      const images = await Promise.all(photos.map(photo => loadImage(photo.url)));
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1920;
      drawMontage(canvas, images);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .94));
      const file = new File([blob], `story-${Date.now()}.jpg`, { type: 'image/jpeg' });
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ title: 'Ma story', text: 'Créée avec Story Maker', files: [file] });
        showToast('Story partagée');
      } else {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = file.name;
        link.click();
        URL.revokeObjectURL(url);
        showToast('Story téléchargée dans tes fichiers');
      }
    } catch (error) {
      if (error.name !== 'AbortError') showToast('Impossible de créer la story');
    } finally {
      exportButton.disabled = false;
    }
  }

  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });
  }

  function drawMontage(canvas, images) {
    const context = canvas.getContext('2d');
    context.fillStyle = '#101820';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const cells = getCells(images.length, canvas.width, canvas.height);
    images.forEach((image, index) => drawCroppedImage(context, image, cells[index], photos[index]));
    context.filter = 'none';
    context.fillStyle = '#ffffff';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.shadowColor = '#000000';
    context.shadowBlur = 16;
    if (overlayText) {
      context.font = 'bold 76px Georgia';
      context.fillText(overlayText, canvas.width / 2, canvas.height * .12, canvas.width * .84);
    }
    if (sticker) {
      context.font = '150px sans-serif';
      context.fillText(sticker, canvas.width * .82, canvas.height * .87);
    }
    context.shadowBlur = 0;
  }

  function getCells(length, width, height) {
    if (template === 'strip' || length === 1) {
      return Array.from({ length }, (_, index) => ({ x: 0, y: index * height / length, width, height: height / length }));
    }
    if (template === 'focus') {
      const mainHeight = height * .55;
      return [{ x: 0, y: 0, width, height: mainHeight }, ...Array.from({ length: length - 1 }, (_, index) => ({
        x: index % 2 * width / 2,
        y: mainHeight,
        width: width / 2,
        height: height - mainHeight,
      }))];
    }
    const columns = 2;
    const rows = Math.ceil(length / columns);
    return Array.from({ length }, (_, index) => ({
      x: index % columns * width / columns,
      y: Math.floor(index / columns) * height / rows,
      width: width / columns,
      height: height / rows,
    }));
  }

  function drawCroppedImage(context, image, cell, photo) {
    const scale = Math.max(cell.width / image.naturalWidth, cell.height / image.naturalHeight);
    const sourceWidth = cell.width / scale;
    const sourceHeight = cell.height / scale;
    const maxX = image.naturalWidth - sourceWidth;
    const sourceX = maxX * ((photo.cropX ?? 50) / 100);
    const sourceY = (image.naturalHeight - sourceHeight) * ((photo.cropY ?? 50) / 100);
    context.save();
    context.beginPath();
    context.rect(cell.x, cell.y, cell.width, cell.height);
    context.clip();
    context.filter = FILTERS[filter];
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, cell.x, cell.y, cell.width, cell.height);
    context.restore();
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
  }

  let toastTimer;
  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2800);
  }

  render();
})();
