def pytest_configure(config):
    # The real-corpus checks read (and one renders) all 8 practice-test PDFs.
    # They run by default; `-m "not slow"` leaves them out for a quick pass.
    config.addinivalue_line(
        "markers", "slow: reads or renders the real practice-test PDFs (tens of seconds)")
