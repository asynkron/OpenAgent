// Subtle frame flicker / jitter to sell the CRT illusion
(function(){
  const root = document.getElementById('root');
  if (!root) return;
  let t = 0; function raf(){
    t += 1; const jitter = (Math.random()-0.5) * 0.3; root.style.transform = `translateY(${jitter}px)`;
    requestAnimationFrame(raf);
  } requestAnimationFrame(raf);
})();
