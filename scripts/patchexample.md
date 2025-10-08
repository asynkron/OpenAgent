# Headerless Patch

```
any-tool-that-accepts-patches <<'EOF'
*** Begin Patch
*** Update File: src/cli/components/CliApp.js
@@
-  const [planProgress, setPlanProgress] = useState(null);
+  const [planProgress, setPlanProgress] = useState({ seen: false, value: null });
@@
-        case 'plan-progress':
-          setPlanProgress(event.progress || null);
+        case 'plan-progress':
+          setPlanProgress({ seen: true, value: event.progress || null });
           break;
@@
-      <PlanProgress progress={planProgress} />
+      {planProgress.seen ? <PlanProgress progress={planProgress.value} /: null}
*** End Patch
EOF
Success. Updated the following files:
M src/cli/components/CliApp.js
```
