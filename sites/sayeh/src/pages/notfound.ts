import type { PageFactory } from '../app';

const notFound: PageFactory = () => ({
  title: 'Not found — SAYEH',
  html: `
<section class="page-head page-head--center notfound">
  <p class="eyebrow mono">404</p>
  <h1 class="h1">This cup is <em>empty.</em></h1>
  <p class="lede">The page you were looking for isn’t here. Maybe it was never brewed.</p>
  <div class="row-center"><a class="btn btn--solid" href="/">Pour a fresh one</a><a class="btn btn--ghost" href="/shop">Browse coffees</a></div>
</section>`,
});

export default notFound;
