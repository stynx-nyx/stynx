describe('stynx shell', () => {
  it('loads the login page', () => {
    cy.visit('/login');
    cy.contains('Sign in');
  });
});
