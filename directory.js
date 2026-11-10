// All links and tags are static HTML. This only filters the existing cards.
const filter = document.querySelector('#course-filter');
const controls = document.querySelector('.directory-controls');
const count = document.querySelector('#tool-count');
const cards = [...document.querySelectorAll('#directory-tools .tool-card')];
const courses = new Set(['BUS-2150', 'BUS-3150', 'MGMT-4570']);
const legacyCourseAnchors = {
  '#business-statistics': 'BUS-2150',
  '#operations-analysis': 'BUS-3150',
  '#lean-operations': 'MGMT-4570',
};

function selectedCourse() {
  const url = new URL(window.location.href);
  const requested = url.searchParams.get('course') ?? legacyCourseAnchors[url.hash];
  return courses.has(requested) ? requested : 'all';
}

function applyFilter(course) {
  filter.value = course;
  let visible = 0;
  for (const card of cards) {
    card.hidden = course !== 'all' && !card.dataset.courses.split(' ').includes(course);
    if (!card.hidden) visible++;
  }
  count.textContent = `${visible} ${visible === 1 ? 'tool' : 'tools'}`;
}

filter.addEventListener('change', () => {
  const course = courses.has(filter.value) ? filter.value : 'all';
  const url = new URL(window.location.href);
  if (course === 'all') url.searchParams.delete('course');
  else url.searchParams.set('course', course);
  if (legacyCourseAnchors[url.hash]) url.hash = '';
  if (url.href !== window.location.href) window.history.pushState(null, '', url);
  applyFilter(course);
});
window.addEventListener('popstate', () => applyFilter(selectedCourse()));
window.addEventListener('hashchange', () => applyFilter(selectedCourse()));
window.addEventListener('pageshow', () => applyFilter(selectedCourse()));
applyFilter(selectedCourse());
controls.hidden = false;
