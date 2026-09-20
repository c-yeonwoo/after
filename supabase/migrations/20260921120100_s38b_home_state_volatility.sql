-- next_candidate()가 노출 원장을 기록하므로 이를 호출하는 홈 집계도 읽기 전용이 아니다.
alter function home_state() volatile;

comment on function home_state() is
  '홈이 필요한 상태 전부를 한 번에. 여성 후보를 처음 배정할 때 노출 원장을 기록한다.';
