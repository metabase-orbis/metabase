export function setupMetabaseCloud() {
  const path = "/api/setting/site-url";
  cy.request("GET", path).then(response => {
    const siteUrlSetting = response.body;
    cy.request("PUT", path, {
      ...siteUrlSetting,
      value: "https://CYPRESSTESTENVIRONMENT.metabaseapp.com",
    });
  });
}
