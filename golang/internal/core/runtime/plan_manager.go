package runtime

import (
	"errors"
	"sort"
	"strings"
	"sync"
)

// PlanManager maintains the merged plan shared across passes.
type PlanManager struct {
	mu    sync.RWMutex
	order []string
	steps map[string]*PlanStep
}

// NewPlanManager constructs an empty plan manager.
func NewPlanManager() *PlanManager {
	return &PlanManager{
		steps: make(map[string]*PlanStep),
	}
}

// Replace swaps the current plan with the provided steps.
func (pm *PlanManager) Replace(steps []PlanStep) {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	pm.steps = make(map[string]*PlanStep, len(steps))
	pm.order = pm.order[:0]
	for _, step := range steps {
		copied := step
		pm.steps[step.ID] = &copied
		pm.order = append(pm.order, step.ID)
	}
}

// Snapshot returns a deep copy of the plan for external observers.
func (pm *PlanManager) Snapshot() []PlanStep {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	result := make([]PlanStep, 0, len(pm.order))
	for _, id := range pm.order {
		if step, ok := pm.steps[id]; ok {
			copied := *step
			if step.WaitingForID != nil {
				copied.WaitingForID = append([]string{}, step.WaitingForID...)
			}
			if step.Observation != nil {
				obsCopy := *step.Observation
				if step.Observation.ObservationForLLM != nil {
					payloadCopy := *step.Observation.ObservationForLLM
					if payloadCopy.Plan != nil {
						payloadCopy.Plan = append([]PlanStep{}, payloadCopy.Plan...)
					}
					obsCopy.ObservationForLLM = &payloadCopy
				}
				copied.Observation = &obsCopy
			}
			result = append(result, copied)
		}
	}
	return result
}

// Ready returns the next executable plan step if all dependencies have completed.
func (pm *PlanManager) Ready() (*PlanStep, bool) {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	for _, id := range pm.order {
		step := pm.steps[id]
		if step == nil || step.Status != PlanPending {
			continue
		}
		ready := true
		for _, waitID := range step.WaitingForID {
			dep := pm.steps[waitID]
			if dep == nil {
				continue
			}
			if dep.Status != PlanCompleted {
				ready = false
				break
			}
		}
		if ready {
			copied := *step
			return &copied, true
		}
	}
	return nil, false
}

// UpdateStatus updates the step status while preserving metadata.
func (pm *PlanManager) UpdateStatus(id string, status PlanStatus, observation *PlanObservation) error {
	pm.mu.Lock()
	defer pm.mu.Unlock()

	step, ok := pm.steps[id]
	if !ok {
		return errors.New("plan: unknown step id")
	}
	step.Status = status
	if observation != nil {
		step.Observation = observation
	}
	return nil
}

// HasPending reports whether any step is still pending.
func (pm *PlanManager) HasPending() bool {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	for _, step := range pm.steps {
		if step != nil && step.Status == PlanPending {
			return true
		}
	}
	return false
}

// Completed reports whether every step finished successfully.
func (pm *PlanManager) Completed() bool {
	pm.mu.RLock()
	defer pm.mu.RUnlock()

	for _, step := range pm.steps {
		if step == nil {
			continue
		}
		if step.Status != PlanCompleted {
			return false
		}
	}
	return len(pm.steps) > 0
}

// SortOrder returns the deterministic step order for reporting.
func (pm *PlanManager) SortOrder() []PlanStep {
	snapshot := pm.Snapshot()
	sort.SliceStable(snapshot, func(i, j int) bool {
		return strings.Compare(snapshot[i].ID, snapshot[j].ID) < 0
	})
	return snapshot
}
