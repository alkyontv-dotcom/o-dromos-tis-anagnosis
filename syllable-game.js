/* Image-led syllable practice using the existing ordered word and image data. */
(() => {
  'use strict';
  const items = window.WORD_BUILDING_ITEMS;
  const $ = id => document.getElementById(id);
  let showScreen = id => document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  let index = 0, round = 0, locked = false, feedbackTimer = null, advanceTimer = null, offset = Math.floor(Math.random() * 3);
  const norm = s => s.normalize('NFC').toLocaleLowerCase('el-GR');
  const shuffle = a => { for (let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];} return a; };
  function positionFor(i) { const n=items[i].syllables.length; if(n===2)return (i+offset)%2? n-1:0; if(n>=3){const spots=[0,Math.floor((n-1)/2),n-1];return spots[(i+offset)%3];} return 0; }
  function makeChoices(i,pos) {
    const accentCaps={ά:'Ά',έ:'Έ',ή:'Ή',ί:'Ί',ό:'Ό',ύ:'Ύ',ώ:'Ώ'};
    const format=s=>pos===0?s.replace(/^[αεηιουω]/u,first=>accentCaps[first]||first.toLocaleUpperCase('el-GR')):s.toLocaleLowerCase('el-GR');
    const item=items[i], correct=item.syllables[pos], excluded=new Set(item.syllables.map(norm));
    const pool=[], seen=new Set([norm(correct)]);
    items.flatMap(x=>x.syllables).forEach(s=>{if(excluded.has(norm(s)))return;const candidate=format(s),key=norm(candidate);if(!seen.has(key)){seen.add(key);pool.push(candidate)}});
    let preferred=pool.filter(s=>Array.from(s).length===Array.from(correct).length);
    const picked=shuffle(preferred.length>=3?preferred:pool).slice(0,3);
    return shuffle([correct,...picked]);
  }
  function getQuestion(i,pos=positionFor(i)) {
    const item=items[i]; if(!item || !item.syllables) throw new Error('Missing syllable data for item '+(i+1));
    return {id:item.id,image:item.image,word:item.syllables.join(''),syllables:item.syllables.slice(),missingPosition:pos,missingSyllable:item.syllables[pos],blankCount:Array.from(item.syllables[pos]).length,choices:makeChoices(i,pos)};
  }
  function setMessage(text,type='') { const el=$('syllableFeedback'); el.textContent=text; el.className='syllable-feedback'+(type?' '+type:''); }
  function makeWord(question) {
    const word=$('syllablePrompt'); word.replaceChildren(); word.setAttribute('aria-label','Λέξη με κενή συλλαβή');
    question.syllables.forEach((part,i)=>{
      if(i===question.missingPosition){const blanks=document.createElement('span');blanks.className='syllable-blanks';blanks.setAttribute('aria-label','Κενή συλλαβή');for(const _ of Array.from(part)){const line=document.createElement('span');line.className='syllable-blank';line.setAttribute('aria-hidden','true');blanks.append(line)}word.append(blanks)}
      else {const span=document.createElement('span');span.className='syllable-piece';span.textContent=part;word.append(span)}
    });
  }
  function render() {
    const q=getQuestion(index), token=++round; locked=false; clearTimeout(feedbackTimer);clearTimeout(advanceTimer);
    $('syllableProgress').textContent=`Λέξη ${index+1} από ${items.length}`;
    const img=$('syllablePicture');img.src=q.image;img.alt=`Εικόνα ${q.id}`;
    makeWord(q);setMessage('Διάλεξε τη συλλαβή που λείπει.');
    const choices=$('syllableChoices');choices.replaceChildren();
    q.choices.forEach(choice=>{const b=document.createElement('button');b.type='button';b.className='syllable-choice';b.textContent=choice;b.addEventListener('click',()=>answer(choice,q,token));choices.append(b)});
    $('syllablePlay').hidden=false;$('syllableComplete').hidden=true;
  }
  function answer(choice,q,token) {
    if(locked||token!==round)return;
    if(norm(choice)===norm(q.missingSyllable)) {
      locked=true;setMessage('Μπράβο!','success');$('syllableChoices').querySelectorAll('button').forEach(b=>b.disabled=true);
      advanceTimer=setTimeout(()=>{if(token!==round)return;if(index===items.length-1)complete();else {index++;render()}},850);
    } else {
      const now=Date.now();if(now<(answer.cooldown||0))return;answer.cooldown=now+650;
      setMessage('Προσπάθησε ξανά!','error');const choices=$('syllableChoices');choices.classList.add('syllable-shake');setTimeout(()=>choices.classList.remove('syllable-shake'),360);
      feedbackTimer=setTimeout(()=>{if(token===round)setMessage('Διάλεξε τη συλλαβή που λείπει.')},1000);
    }
  }
  function complete(){round++;$('syllablePlay').hidden=true;$('syllableComplete').hidden=false;setMessage('');}
  function start(){index=0;offset=Math.floor(Math.random()*3);render();showScreen('syllableGame');}
  function init(options){if(options&&options.show)showScreen=options.show;
    $('syllableModuleCard').addEventListener('click',start);$('syllableHomeBack').addEventListener('click',()=>showScreen('appHome'));
    $('syllableRestart').addEventListener('click',start);$('syllableCompleteHome').addEventListener('click',()=>showScreen('appHome'));
  }
  window.SyllableGame={init,start,getQuestion,items};
})();
