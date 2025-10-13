# How to self heal.

1. Run `npm run lint -- --fix` to fix lint issues.
   If there are remaining lint issues, that is your first task to fix.

2. Run `npm run test` to see if tests are failing.
   If there are failing tests, that is your next task to fix.

3. Scan for untyped code, we are aiming for strictly typed code. no `any` or implicit any, or strange `if x is function` checks.

4. Run `npm run fta` to see what code is in need of refactoring.
   If there are suggestions from FTA, that is your next task to fix, pick the top one.

Once you are done with the task,
Run `npm run test` to see that everything is still working.

Now consider the task done.
