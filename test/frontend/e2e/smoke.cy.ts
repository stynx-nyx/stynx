describe('st-core shell', () => {
  it('loads the login page', () => {
    cy.visit('/login');
    cy.contains('Sign in');
  });
});
