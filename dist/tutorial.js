(() => {
  const key = 'gustavsvik-hide-tutorial-v1';
  const steps = [
    ['Välkommen till Gustavsviksbanan', 'Utforska banan och planera ditt nästa slag. Här får du en snabb genomgång av kartans viktigaste verktyg.', '◎'],
    ['Välj ett hål', 'Tryck på Hål och välj mellan hål 1–18. Pilarna bredvid hålnumret tar dig till föregående eller nästa hål. I hela banans överblick visar Visa hål banans sträckning.', '1–18'],
    ['Välj vy och tee', 'Överblick visar hålets sparade kartvy. Greenvy tar dig närmare greenen. Välj Tee 54, 47 eller 40 med knapparna längst ner. Fäll ned menyn med pilen för mer plats åt kartan.', '54 · 47 · 40'],
    ['Utforska avstånden', 'Dra i längdaxelns runda punkter för att planera ditt slag. Siffrorna visar fågelvägsavstånd från vald teeposition till respektive punkt. Mätstickan låter dig mäta mellan två punkter på kartan.', '↔'],
    ['Avstånd från din position', 'Välj ett hål och tryck på GPS-symbolen för att visa avståndet från din position till green. Tillåt platsåtkomst om webbläsaren frågar. Tryck igen för att ta bort GPS-linjen. Noggrannheten beror på telefonens positionsmätning.', '⌖'],
    ['Flytta runt och utforska', 'På mobilen drar du med fingret för att flytta kartan och nyper med två fingrar för att zooma. På datorn flyttar du med vänsterdrag, roterar med högerdrag och zoomar med scroll. Frågetecknet i den övre listen öppnar den här guiden igen.', '↗']
  ];
  const button = document.createElement('button');
  button.className = 'tutorial-toggle';
  button.textContent = '?';
  button.title = 'Visa introduktion';
  button.setAttribute('aria-label', 'Visa introduktion');
  document.querySelector('.header-actions').append(button);
  const dialog = document.createElement('dialog');
  dialog.className = 'tutorial-dialog';
  dialog.setAttribute('aria-labelledby', 'tutorial-title');
  dialog.innerHTML = `<button class="tutorial-close" aria-label="Stäng introduktionen">×</button><p class="tutorial-progress"></p><div class="tutorial-symbol" aria-hidden="true"></div><div aria-live="polite"><h2 id="tutorial-title"></h2><p class="tutorial-description"></p></div><label class="tutorial-preference"><input type="checkbox"> Visa inte igen</label><div class="tutorial-navigation"><button class="tutorial-back">Tillbaka</button><button class="tutorial-next primary">Nästa</button></div>`;
  document.body.append(dialog);
  let index = 0;
  const preference = dialog.querySelector('input');
  const next = dialog.querySelector('.tutorial-next');
  const back = dialog.querySelector('.tutorial-back');
  function render() {
    const [title, description, symbol] = steps[index];
    dialog.querySelector('#tutorial-title').textContent = title;
    dialog.querySelector('.tutorial-description').textContent = description;
    dialog.querySelector('.tutorial-symbol').textContent = symbol;
    dialog.querySelector('.tutorial-progress').textContent = `INTRODUKTION · ${index + 1} AV ${steps.length}`;
    back.disabled = index === 0;
    next.textContent = index === steps.length - 1 ? 'Börja utforska' : 'Nästa';
  }
  function open() {
    index = 0;
    try { preference.checked = localStorage.getItem(key) === 'true'; } catch {}
    render();
    if (!dialog.open) dialog.showModal();
  }
  preference.onchange = () => { try { localStorage.setItem(key, String(preference.checked)); } catch {} };
  next.onclick = () => { if (index === steps.length - 1) dialog.close(); else { index++; render(); } };
  back.onclick = () => { if (index > 0) { index--; render(); } };
  dialog.querySelector('.tutorial-close').onclick = () => dialog.close();
  button.onclick = open;
  let hidden = false;
  try { hidden = localStorage.getItem(key) === 'true'; } catch {}
  if (!hidden) open();
})();
