FROM python:3.9

WORKDIR /code

# Copy requirements first (better caching)
COPY ./requirements.txt /code/requirements.txt

# Install dependencies
RUN pip install --no-cache-dir --upgrade -r /code/requirements.txt

# Copy the application code
COPY ./app.py /code/app.py

# Launch the server
# Note: app:app refers to file 'app.py' and object 'app' inside it
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]