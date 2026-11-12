// Minimal manual method+pattern dispatch table — deliberately not a
// framework. Matchers are either an exact string or a RegExp whose named
// capture groups (?<id>...) become route params.
class Router {
  constructor() {
    this.routes = [];
  }

  add(method, matcher, handler) {
    this.routes.push({ method, matcher, handler });
  }

  get(matcher, handler) { this.add('GET', matcher, handler); }
  post(matcher, handler) { this.add('POST', matcher, handler); }
  put(matcher, handler) { this.add('PUT', matcher, handler); }
  delete(matcher, handler) { this.add('DELETE', matcher, handler); }

  match(method, pathname) {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      if (typeof route.matcher === 'string') {
        if (route.matcher === pathname) return { handler: route.handler, params: {} };
      } else if (route.matcher instanceof RegExp) {
        const m = pathname.match(route.matcher);
        if (m) return { handler: route.handler, params: m.groups || {} };
      }
    }
    return null;
  }
}

module.exports = { Router };
