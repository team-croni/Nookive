# Kubernetes 클러스터 운영 및 긴급 장애 대응 매뉴얼

## 1. CrashLoopBackOff 파드 트러블슈팅
1. `kubectl describe pod <pod-name> -n <namespace>` 명령으로 OOMKilled 또는 Exit Code 137 여부 확인
2. 메모리 상한(Memory Limit) 초과 시 리소스 명세의 limits.memory 상향 조정
3. 컨테이너 내부 덤프 로그 수집: `kubectl logs --previous <pod-name>`

## 2. HPA (Horizontal Pod Autoscaler) 설정 기준
* CPU 사용률 70% 또는 P95 지연시간 200ms 초과 시 오토스케일링 발동
* Min Replicas: 3, Max Replicas: 20
* 스케일 다운 쿨다운 타임: 300초 (Flapping 방지)
