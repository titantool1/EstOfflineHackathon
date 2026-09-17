#!/usr/bin/env python3
"""Check the web/Spring/PG path in an isolated Compose project, then remove it."""
import argparse
import json
import os
from pathlib import Path
import re
import socket
import subprocess
import time
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--project', default='eco-app-scaffold-check')
    parser.add_argument('--web-port', type=int, default=33301)
    parser.add_argument('--backend-port', type=int, default=28081)
    parser.add_argument('--postgres-port', type=int, default=35434)
    parser.add_argument('--output', type=Path, default=ROOT / '.local/app-check.json')
    args = parser.parse_args()
    if not re.fullmatch(r'eco-[a-z0-9-]+-check', args.project):
        parser.error('Use an isolated project named eco-...-check')
    env = {**os.environ, 'FRONTEND_PORT': str(args.web_port), 'BACKEND_PORT': str(args.backend_port),
           'POSTGRES_PORT': str(args.postgres_port)}
    compose = ['docker', 'compose', '-p', args.project, '--profile', 'app']
    label = 'label=com.docker.compose.project=' + args.project
    result = {'project': args.project, 'checks': {}, 'result': 'incomplete'}
    checks = result['checks']
    args.output.parent.mkdir(parents=True, exist_ok=True)

    def run(command, **kwargs):
        return subprocess.run(command, cwd=ROOT, env=env, text=True, check=True, **kwargs)

    def output(command):
        return run(command, capture_output=True).stdout.strip()

    def remaining(kind):
        command = ['docker', 'ps', '-aq'] if kind == 'containers' else ['docker', kind, 'ls', '-q']
        return output(command + ['--filter', label]).splitlines()

    def snapshot(ids):
        if not ids:
            return []
        return output(['docker', 'inspect', '--format', '{{.Id}}|{{.State.Status}}|{{.State.StartedAt}}', *ids]).splitlines()

    def http(port, path='/api/health', method='GET', request_id=None):
        request = Request(f'http://127.0.0.1:{port}{path}', method=method,
                          headers={'X-Request-Id': request_id} if request_id else {})
        try:
            response = urlopen(request, timeout=10)
        except HTTPError as error:
            response = error
        with response:
            raw = response.read().decode()
            data = json.loads(raw) if 'json' in response.headers.get('Content-Type', '') else raw
            return response.status, data, response.headers

    def healthy(port):
        deadline = time.monotonic() + 40
        while time.monotonic() < deadline:
            try:
                status, body, headers = http(port)
                if status == 200 and body['data'] == {'status': 'UP', 'database': 'UP'}:
                    assert body['error'] is None
                    assert body['requestId'] == headers['X-Request-Id']
                    assert 'no-store' in headers['Cache-Control']
                    return
            except (URLError, TimeoutError):
                pass
            time.sleep(1)
        raise AssertionError('Health did not recover within 40 seconds')

    for kind in ['containers', 'volume', 'network']:
        assert not remaining(kind), f'Existing test {kind}; refusing to modify project'
    for port in [args.web_port, args.backend_port, args.postgres_port]:
        with socket.socket() as connection:
            connection.bind(('127.0.0.1', port))
    ids = output(['docker', 'ps', '-q']).splitlines()
    before = snapshot(ids)
    log_path = ROOT / '.local/app-check.log'
    log_path.parent.mkdir(exist_ok=True)
    result['runtime_log'] = str(log_path)
    with log_path.open('w') as log:
        try:
            print('Starting isolated PostgreSQL, Spring and web.', flush=True)
            run(compose + ['up', '-d', '--build', '--wait', '--wait-timeout', '180', 'postgres', 'backend', 'frontend'],
                stdout=log, stderr=subprocess.STDOUT, timeout=1200)
            healthy(args.backend_port)
            healthy(args.web_port)
            checks['web_spring_postgres_healthy'] = True
            code, body, headers = http(args.backend_port, request_id='step2-correlation')
            assert code == 200 and body['requestId'] == headers['X-Request-Id'] == 'step2-correlation'
            checks['request_id_propagation'] = True
            code, body, headers = http(args.backend_port, request_id='bad id')
            assert code == 200 and body['requestId'] != 'bad id'
            assert re.fullmatch(r'[a-f0-9-]{36}', body['requestId'])
            checks['invalid_request_id_replaced'] = True
            for method, path, expected in [('POST', '/api/health', 405), ('GET', '/api/missing-scaffold-route', 404)]:
                code, body, _ = http(args.backend_port, path, method)
                assert code == expected and body['error']['code'] == f'HTTP_{expected}'
            checks['http_errors_preserve_404_405'] = True
            checks['existing_pages'] = {}
            for path in ['/', '/missions', '/chat', '/map', '/onboarding']:
                code, _, _ = http(args.web_port, path)
                assert code == 200, path
                checks['existing_pages'][path] = code
            print('Healthy path passed; checking isolated database outage and recovery.', flush=True)
            run(compose + ['stop', 'postgres'], stdout=log, stderr=subprocess.STDOUT, timeout=45)
            for port in [args.backend_port, args.web_port]:
                code, body, _ = http(port)
                assert code == 503 and body['error']['code'] == 'DATABASE_UNAVAILABLE', (code, body)
                assert body['data'] is None
                assert not any(token in json.dumps(body) for token in ['jdbc:', 'password=', 'postgres:5432'])
            checks['database_outage_is_503_without_connection_details'] = True
            run(compose + ['start', 'postgres'], stdout=log, stderr=subprocess.STDOUT, timeout=45)
            healthy(args.web_port)
            checks['database_recovery_without_app_restart'] = True
            print('Database recovery passed; checking isolated backend outage and recovery.', flush=True)
            run(compose + ['stop', 'backend'], stdout=log, stderr=subprocess.STDOUT, timeout=45)
            code, body, _ = http(args.web_port)
            assert code == 503 and body['error']['code'] == 'BACKEND_UNAVAILABLE'
            checks['backend_outage_is_503'] = True
            run(compose + ['start', 'backend'], stdout=log, stderr=subprocess.STDOUT, timeout=45)
            healthy(args.web_port)
            checks['backend_recovery_without_web_restart'] = True
            result['result'] = 'pass'
        except Exception as error:
            result['result'] = 'failed'
            result['error_type'] = type(error).__name__
            raise
        finally:
            cleanup = subprocess.run(compose + ['down', '--volumes', '--remove-orphans'], cwd=ROOT, env=env,
                                     stdout=log, stderr=subprocess.STDOUT, timeout=90)
            result['cleanup'] = {'exit_code': cleanup.returncode,
                                 **{kind: remaining(kind) for kind in ['containers', 'volume', 'network']}}
            result['preserved_services_before'] = before
            result['preserved_services_after'] = snapshot(ids)
            result['existing_services_unchanged'] = before == result['preserved_services_after']
            if cleanup.returncode or any(result['cleanup'][k] for k in ['containers', 'volume', 'network']) or not result['existing_services_unchanged']:
                result['result'] = 'failed_cleanup_or_preservation'
            args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
    assert result['result'] == 'pass'
    print(json.dumps({'result': result['result'], 'checks': checks, 'cleanup': result['cleanup'],
                      'existing_services_unchanged': result['existing_services_unchanged']}, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
